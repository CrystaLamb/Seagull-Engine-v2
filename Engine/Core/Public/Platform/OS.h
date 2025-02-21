#pragma once

#include "Defs/Defs.h"
#include "Core/Config.h"
#include "Base/BasicTypes.h"

#include "Math/MathBasic.h"

#include "Stl/vector.h"
#include "Stl/string.h"
#include "Stl/string_view.h"

namespace SG
{

	typedef void* WindowHandle;

	enum class EOsMessage
	{
		eNull = 0,
		eQuit,
	};

	enum class ECursorType
	{
		eArrow = 0,
		eTextInput,
		eResizeNS, // north, south resize
		eResizeWE, // west, east resize
		eResizeNWSE, // north-west, south-east resize
		eResizeNESW, // north-east, south-west resize
		eResizeAll,
		eHand,
		eNoAllowed,
		eHelp,
		eStarting,
		eWait,

		MAX_NUM_CURSOR,
	};

	//! Resolution in pixel.
	struct Resolution
	{
		UInt32 width;
		UInt32 height;

		bool operator==(const Resolution& rhs)
		{
			return width == rhs.width && height == rhs.height;
		}
		bool operator!=(const Resolution& rhs)
		{
			return !operator==(rhs);
		}
	};

	//! Rectangle to indicate an area on screen.
	struct Rect
	{
		Int32 left;
		Int32 top;
		Int32 right;
		Int32 bottom;

		bool operator==(const Rect& rhs) const noexcept
		{
			return left == rhs.left && top == rhs.top &&
				right == rhs.right && bottom == rhs.bottom;
		}
		bool operator!=(const Rect& rhs) const noexcept
		{
			return !(*this == rhs);
		}
	};

	//! Abstraction of monitor of current PC.
	//! Unable to modify the data by user.
	class Monitor
	{
	public:
		Monitor() = default;
		~Monitor() = default;

		SG_CORE_API wstring     GetName() const;
		SG_CORE_API wstring     GetAdapterName() const;
		SG_CORE_API UInt32      GetIndex() const;
		SG_CORE_API Rect        GetMonitorRect() const;
		SG_CORE_API Rect        GetWorkRect() const;
		SG_CORE_API Resolution  GetDefaultResolution() const;

		bool IsPrimary() const;
	private:
		friend class DeviceManager;
	private:
		wstring             mName;              //!< Name of the monitor.
		wstring             mAdapterName;       //!< Adapter name of the monitor.
		UInt32              mIndex;             //!< Index of all the monitors.
		Rect                mMonitorRect;       //!< Window Rect of the monitor. (in logical resolution).
		Rect                mWorkRect;	        //!< Work rect of the monitor.
		vector<Resolution>  mResolutions;       //!< All the supported resolution.
		Resolution          mDefaultResolution; //!< Physical resolution.
		bool                bIsPrimary;         //!< Is this monitor a primary monitor.
	};

	//! Abstraction of a adapter of a GPU of kernel display device.
	//! Unable to modify the data by user.
	class Adapter
	{
	public:
		Adapter() = default;
		~Adapter() = default;

		SG_CORE_API wstring GetName() const;
		SG_CORE_API wstring GetDisplayName() const;

		bool    IsActive() const;
	private:
		friend class DeviceManager;
	private:
		wstring          mName;
		wstring          mDisplayName;
		vector<Monitor*> mMonitors;
		bool             bIsActive;
	};

	class Window
	{
	public:
		SG_CORE_API explicit Window(Monitor* const pMonitor, wstring_view name = L"Mr No Name");
		SG_CORE_API ~Window();

		SG_CORE_API void SetTitle(const char* title);

		SG_CORE_API void ShowWindow() const;
		SG_CORE_API void HideWindow() const;

		SG_CORE_API void Resize(const Rect& rect);
		SG_CORE_API void Resize(UInt32 width, UInt32 height);

		SG_CORE_API void ToggleFullSrceen();
		SG_CORE_API void Maximized();
		SG_CORE_API void Minimized();

		SG_CORE_API bool IsMinimize() const;

		SG_CORE_API void SetFocus();
		SG_CORE_API bool IsFocus();

		SG_CORE_API void SetSize(UInt32 width, UInt32 height);
		SG_CORE_API void SetPosition(UInt32 x, UInt32 y);

		SG_CORE_API void        SetClipboardText(const char* text);
		SG_CORE_API const char* GetClipboardText();

		SG_CORE_API Rect   GetCurrRect();
		SG_CORE_API UInt32 GetWidth();
		SG_CORE_API UInt32 GetHeight();
		SG_CORE_API float  GetAspectRatio();
		SG_CORE_API Vector2i GetMousePosRelative() const;
		SG_CORE_API WindowHandle GetNativeHandle();

		SG_CORE_API bool IsMouseCursorInWindow();
	private:
		void AdjustWindow();
	private:
		wstring      mTitie;
		WindowHandle mHandle = nullptr;
		Monitor*     mpCurrMonitor = nullptr;
		Rect         mFullscreenRect;
		Rect         mWindowedRect;    //! Used to save the size of windowed rect, to restore from full screen.
		bool         mbIsFullScreen = false;
		bool         mbIsMaximized = false;
		bool         mbIsMinimized = false;
	};

	class DeviceManager
	{
	public:
		//! When initializing, collect all the device information once.
		void OnInit();
		void OnShutdown();

		//! Get the information of monitor by index.
		Monitor* GetMonitor(UInt32 index);
		//! Get the primary monitor.
		Monitor* GetPrimaryMonitor();
		//! Get current monitor's dpi scale
		Vector2f GetDpiScale() const;

		UInt32   GetAdapterCount() const;
		Adapter* GetPrimaryAdapter();
	private:
		//! Collect all the informations of the monitors and the adapters currently active.
		void      CollectInfos();
	private:
		vector<Monitor> mMonitors;
		vector<Adapter> mAdapters;
		UInt32          mAdapterCount;
	};

	class WindowManager
	{
	public:
		void OnInit(Monitor* const pMonitor);
		void OnShutdown();

		Window* CreateNewWindow(Monitor* const pMonitor);

		Window* GetMainWindow() const;

		// should window manager have all these api?
		void ShowMouseCursor() const;
		void HideMouseCursor() const;

		void SetMouseCursor(ECursorType type);
	private:
		Window* mMainWindow = nullptr;
		vector<Window*> mSecondaryWindows;
	};

	//! Helper function to get the width of the SRect.
	static SG_INLINE UInt32 GetRectWidth(const Rect& rect) { return rect.right - rect.left; }
	//! Helper function to get the height of the SRect.
	static SG_INLINE UInt32 GetRectHeight(const Rect& rect) { return rect.bottom - rect.top; }

	// TODO: maybe put this on a message bus to transfer all the os messages.
	SG_CORE_API EOsMessage PeekOSMessage();
	// TODO: return a EOsError as a error handle to propagate on message bus. 
	SG_CORE_API void       PeekLastOSError();

	class OperatingSystem
	{
	public:
		SG_CORE_API static Monitor* GetMainMonitor();
		SG_CORE_API static Adapter* GetPrimaryAdapter();
		SG_CORE_API static const UInt32 GetAdapterCount();
		SG_CORE_API static Window* GetMainWindow();

		SG_CORE_API static Window* CreateNewWindow();

		SG_CORE_API static Vector2i GetMousePos();

		SG_CORE_API static void ShowMouseCursor();
		SG_CORE_API static void HideMouseCursor();

		SG_CORE_API static void SetMouseCursor(ECursorType type);

		SG_CORE_API static bool IsMainWindowOutOfScreen();
	private:
		friend class System;

		static void OnInit();
		static void OnShutdown();
	private:
		static DeviceManager mDeviceManager;
		static WindowManager mWindowManager;
	};

}