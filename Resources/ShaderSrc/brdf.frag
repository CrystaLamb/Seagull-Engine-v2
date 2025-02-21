#version 460

layout (location = 0) in vec3 inNormalWS;
layout (location = 1) in vec3 inPosWS;
layout (location = 2) in vec2 inUV;
layout (location = 3) in vec3 inTangentWS;
layout (location = 4) in vec3 inViewPosWS;
layout (location = 5) in vec4 inShadowMapPos;
layout (location = 6) in flat uint inId;

layout (set = 0, binding = 1) uniform LightUBO
{
	mat4  lightSpaceVP;
	vec3  viewDirection;
	float pad;
	vec4  directionalColor;
	vec3  pointLightPos;
	float pointLightRadius;
	vec3  pointLightColor;
} lightUbo;

layout (set = 0, binding = 2) uniform CompositionUBO
{
	float gamma;
    float exposure;
} compositionUbo;

struct ObjectRenderData
{
	mat4 model;
	mat4 inverseTransposeModel;
	vec2 mr;
    int instanceId;
    int meshId;
	vec3 albedo;
	uint texFlag;
};

// all object matrices
layout(std140, set = 1, binding = 0) readonly buffer PerObjectBuffer
{
	ObjectRenderData objects[];
} perObjectBuffer;

layout(set = 0, binding = 3) uniform sampler2D sShadowMap;
layout(set = 0, binding = 4) uniform sampler2D sBrdfLutMap;
layout(set = 0, binding = 5) uniform samplerCube sIrradianceCubeMap;
layout(set = 0, binding = 6) uniform samplerCube sPrefilterCubeMap;

layout(set = 1, binding = 1) uniform sampler2D sAlbedoMap;
layout(set = 1, binding = 2) uniform sampler2D sMetallicMap;
layout(set = 1, binding = 3) uniform sampler2D sRoughnessMap;
layout(set = 1, binding = 4) uniform sampler2D sAOMap;
layout(set = 1, binding = 5) uniform sampler2D sNormalMap;

layout (location = 0) out vec4 outColor;

//#define ALBEDO pow(texture(sAlbedoMap, inUV).rgb, vec3(2.2)) // gamma correction to the texture
//#define ALBEDO perObjectBuffer.objects[inId].albedo
//#define ALBEDO vec3(1.0, 1.0, 1.0)
//#define ALBEDO cullingOutputData.objects[inId].albedo
#define PI 3.1415926535897932384626433832795
#define SHADOW_COLOR vec3(0.0, 0.0, 0.0)

#define ALBEDO_TEX_MASK 0x01
#define METALLIC_TEX_MASK 0x02
#define ROUGHNESS_TEX_MASK 0x04
#define NORMAL_TEX_MASK 0x08
#define AO_TEX_MASK 0x10

float SampleShadowMap(vec4 shadowMapPos)
{
    // for perspective projection, we need to normalized the position
    vec3 shadowCoord = shadowMapPos.xyz / shadowMapPos.w;
    if (shadowCoord.x > 1.0 || shadowCoord.x < 0.0 ||
		shadowCoord.y > 1.0 || shadowCoord.y < 0.0) // exceed the depth texture
        return 0.0;

    float closestDepth = texture(sShadowMap, shadowCoord.xy).r; // closest depth to the light
    float currentDepth = shadowCoord.z;

    float shadow = currentDepth > closestDepth ? 1.0 : 0.0;

	return shadow;
}

float SampleShadowMapPCF(vec4 shadowMapPos)
{
    float shadow = 0.0;
    vec3 shadowCoord = shadowMapPos.xyz / shadowMapPos.w;
    if (shadowCoord.x > 1.0 || shadowCoord.x < 0.0 ||
		shadowCoord.y > 1.0 || shadowCoord.y < 0.0) // exceed the depth texture
        return 0.0;

    vec2 texelSize = 1.0 / textureSize(sShadowMap, 0);
    // 3x3 kernel
    for(int dx = -1; dx <= 1; ++dx)
    {
        for(int dy = -1; dy <= 1; ++dy)
        {
            float depth = texture(sShadowMap, shadowCoord.xy + vec2(dx, dy) * texelSize).r; 
            shadow += shadowCoord.z > depth ? 1.0 : 0.0;        
        }    
    }
    shadow /= 9.0;
    return shadow;
}

vec3 CalcPointLightRadiance(vec3 lightDir, vec3 lightColor, float rad)
{
    float distanceSqr = max(dot(lightDir, lightDir), 0.00001);
    float radius = max(rad, 0.000001);
    float d2r2 = distanceSqr / (radius * radius);
    float rangeAttenuation = max(1.0 - d2r2 * d2r2, 0.0);
	float attenuation = rangeAttenuation * rangeAttenuation / distanceSqr;

    return attenuation * lightColor;
}

// From http://filmicgames.com/archives/75
vec3 Uncharted2Tonemap(vec3 x)
{
	float A = 0.15;
	float B = 0.50;
	float C = 0.10;
	float D = 0.20;
	float E = 0.02;
	float F = 0.30;
	return ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F))-E/F;
}

// Normal Distribution function --------------------------------------
float D_GGX(float dotNH, float roughness)
{
	float alpha = roughness * roughness;
	float alpha2 = alpha * alpha;
	float denom = dotNH * dotNH * (alpha2 - 1.0) + 1.0;
	return (alpha2)/(PI * denom*denom); 
}

// Geometric Shadowing function --------------------------------------
float G_SchlicksmithGGX(float dotNL, float dotNV, float roughness)
{
	float r = (roughness + 1.0);
	float k = (r*r) / 8.0;
	float GL = dotNL / (dotNL * (1.0 - k) + k);
	float GV = dotNV / (dotNV * (1.0 - k) + k);
	return GL * GV;
}

// Fresnel function ----------------------------------------------------
vec3 F_Schlick(float cosTheta, vec3 F0)
{
	return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}
vec3 F_SchlickR(float cosTheta, vec3 F0, float roughness)
{
	return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(1.0 - cosTheta, 5.0);
}

vec3 prefilteredReflection(vec3 R, float roughness)
{
	const float MAX_REFLECTION_LOD = 9.0;
	float lod = roughness * MAX_REFLECTION_LOD;
	float lodf = floor(lod);
	float lodc = ceil(lod);
    // lerp between two mipmap
	vec3 a = textureLod(sPrefilterCubeMap, R, lodf).rgb;
	vec3 b = textureLod(sPrefilterCubeMap, R, lodc).rgb;
	return mix(a, b, lod - lodf);
}

vec3 directLight(vec3 albedo, vec3 L, vec3 V, vec3 N, vec3 F0, float metallic, float roughness, vec3 lightColor)
{
	// Precalculate vectors and dot products	
	vec3 H = normalize(V + L);
	float dotNH = clamp(dot(N, H), 0.0, 1.0);
	float dotNV = clamp(dot(N, V), 0.0, 1.0);
	float dotNL = clamp(dot(N, L), 0.0, 1.0);

	vec3 color = vec3(0.0);
	if (dotNL > 0.0)
    {
		// D = Normal distribution (Distribution of the microfacets)
		float D = D_GGX(dotNH, roughness); 
		// G = Geometric shadowing term (Microfacets shadowing)
		float G = G_SchlicksmithGGX(dotNL, dotNV, roughness);
		// F = Fresnel factor (Reflectance depending on angle of incidence)
		vec3 F = F_Schlick(dotNV, F0);

		vec3 kS = F;
		vec3 kD = (vec3(1.0) - kS) * (1.0 - metallic);

        vec3 diffuse = kD * albedo / PI; // diffuse part (kD * f(lambert)) * ao
		vec3 specular = (D * G) * F / (4.0 * dotNL * dotNV + 0.0001); // specular part (kS * f(cook-torrance))

		color += (diffuse + specular) * lightColor * dotNL;
	}
	return color;
}

vec3 CalculateNormal()
{
	vec3 normalFromMap = texture(sNormalMap, inUV).xyz * 2.0 - 1.0; // shift from [0, 1] to [-1, 1] 

	vec3 T = normalize(inTangentWS);
	vec3 N = normalize(inNormalWS);
	vec3 B = normalize(cross(N, T));
	mat3 TBN = mat3(T, B, N);
	return normalize(TBN * normalFromMap);
}

void main()
{		
	vec3 albedo = perObjectBuffer.objects[inId].albedo;
	if ((perObjectBuffer.objects[inId].texFlag & ALBEDO_TEX_MASK) != 0)
	{
		vec4 texColor = texture(sAlbedoMap, inUV);
		if (texColor.a < 0.5)
			discard;
		albedo = pow(texColor.rgb, vec3(2.2));
	}

	vec3 N = normalize(inNormalWS);
	if ((perObjectBuffer.objects[inId].texFlag & NORMAL_TEX_MASK) != 0)
		N = CalculateNormal();
		
	vec3 V = normalize(inViewPosWS - inPosWS);
	vec3 R = reflect(-V, N);

	float metallic = perObjectBuffer.objects[inId].mr.r;
	float roughness = perObjectBuffer.objects[inId].mr.g;
	if ((perObjectBuffer.objects[inId].texFlag & METALLIC_TEX_MASK) != 0)
		metallic = texture(sMetallicMap, inUV).r;
	if ((perObjectBuffer.objects[inId].texFlag & ROUGHNESS_TEX_MASK) != 0)
		roughness = texture(sRoughnessMap, inUV).r;

	vec3 F0 = vec3(0.04);
	F0 = mix(F0, albedo, metallic);

	vec3 directLighting = vec3(0.0);
	{
		// point light
		vec3 pointLightRadiance = CalcPointLightRadiance(normalize(lightUbo.pointLightPos - inPosWS), lightUbo.pointLightColor, lightUbo.pointLightRadius);
		directLighting += directLight(albedo, normalize(lightUbo.pointLightPos - inPosWS), V, N, F0, metallic, roughness, pointLightRadiance);

		// directional light
		vec3 directionalLightRadiance = directLight(albedo, -lightUbo.viewDirection, V, N, F0, metallic, roughness, lightUbo.directionalColor.rgb);
		float shadow = SampleShadowMapPCF(inShadowMapPos);
		directLighting += mix(directionalLightRadiance, SHADOW_COLOR, shadow);
	}

	
	vec3 indirectLighting = vec3(0.0);
	{
		vec2 brdf = texture(sBrdfLutMap, vec2(max(dot(N, V), 0.0), roughness)).xy;
		vec3 reflectionColor = prefilteredReflection(R, roughness).rgb;	
		vec3 irradiance = texture(sIrradianceCubeMap, N).rgb;

		vec3 kS = F_SchlickR(max(dot(N, V), 0.0), F0, roughness);
		vec3 kD = vec3(1.0) - kS;
		kD *= 1.0 - metallic;

		vec3 diffuseIBL = kD * irradiance * albedo;
		vec3 specularIBL = reflectionColor * (kS * brdf.x + brdf.y);

		vec3 ao = vec3(1.0);
		if ((perObjectBuffer.objects[inId].texFlag & AO_TEX_MASK) != 0)
			ao = texture(sAOMap, inUV).rrr;
		indirectLighting = (diffuseIBL + specularIBL) * ao;
	}

	vec3 color = directLighting + indirectLighting;

	// Tone mapping
	color = Uncharted2Tonemap(color * compositionUbo.exposure);
	color = color * (1.0f / Uncharted2Tonemap(vec3(11.2f)));	

	// Gamma correction
	color = pow(color, vec3(1.0f / compositionUbo.gamma));

	outColor = vec4(color, 1.0);
}