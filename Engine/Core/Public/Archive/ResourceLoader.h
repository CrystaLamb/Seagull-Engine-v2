#pragma once

#include "System/Logger.h"
#include "Memory/Memory.h"

#include "Archive/ResourceDefs.h"
#include "Archive/MeshDataArchive.h"

#include "Stl/string.h"
#include "Stl/vector.h"

namespace SG
{

	enum class ELoadMeshFlag : UInt32
	{
		efLoadEmbeddedMaterials = BIT(0),
		efGenerateAABB = BIT(1),
	};
	SG_ENUM_CLASS_FLAG(UInt32, ELoadMeshFlag);

	template <EResourceTypeCategory type>
	class ResourceLoaderBase
	{
	protected:
		ResourceLoaderBase() = default;
		virtual ~ResourceLoaderBase() = default;

		auto GetResourceType(const string& filename);
	private:
		const char* GetFileNameSuffix(const string& filename);
	};

	template <EResourceTypeCategory type>
	const char* ResourceLoaderBase<type>::GetFileNameSuffix(const string& filename)
	{
		Size dotPos = filename.find_last_of('.');
		return filename.substr(dotPos + 1, filename.size() - 2).c_str();
	}

	template <>
	SG_INLINE auto ResourceLoaderBase<EResourceTypeCategory::eTexture>::GetResourceType(const string& filename)
	{
		const char* suffix = GetFileNameSuffix(filename);
		if (strcmp(suffix, "png") == 0)
			return ETextureType::ePNG;
		else if (strcmp(suffix, "jpg") == 0 || strcmp(suffix, "jpeg") == 0)
			return ETextureType::eJPG;
		else if (strcmp(suffix, "dds") == 0)
			return ETextureType::eDDS;
		else if (strcmp(suffix, "ktx") == 0)
			return ETextureType::eKTX;
		else
		{
			SG_LOG_ERROR("Unsupported texture format: %s", suffix);
			return ETextureType::eUnknown;
		}
	}

	template <>
	SG_INLINE auto ResourceLoaderBase<EResourceTypeCategory::eMesh>::GetResourceType(const string& filename)
	{
		const char* suffix = GetFileNameSuffix(filename);
		if (strcmp(suffix, "obj") == 0)
			return EMeshType::eOBJ;
		else if (strcmp(suffix, "gltf") == 0)
			return EMeshType::eGLTF;
		else
		{
			SG_LOG_ERROR("Unsupported mesh format: %s", suffix);
			return EMeshType::eUnknown;
		}
	}

	//! Disk resource loader for textures.
	class TextureResourceLoader final : public ResourceLoaderBase<EResourceTypeCategory::eTexture>
	{
	public:
		TextureResourceLoader() = default;
		~TextureResourceLoader() = default;

		SG_CORE_API bool LoadFromFile(const char* name, Raw2DTexture& outRaw, bool bNeedMipMap = false, bool bIsCubeMap = false);
		SG_CORE_API bool LoadFromMemory(Byte* pData, UInt32 byteSize, Raw2DTexture& outRaw, bool bNeedMipMap = false, bool bIsCubeMap = false);
	private:
	};

	//! Disk resource loader for meshes.
	class MeshResourceLoader final : public ResourceLoaderBase<EResourceTypeCategory::eMesh>
	{
	public:
		MeshResourceLoader() = default;
		~MeshResourceLoader() = default;

		SG_CORE_API bool LoadFromFile(const string& name, EMeshType type, MeshData& meshData, ELoadMeshFlag flag = ELoadMeshFlag(0));
	private:
	};

}