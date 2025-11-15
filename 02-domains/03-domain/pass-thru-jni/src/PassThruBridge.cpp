#include "selfservice/pass_thru/PassThruBridge.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <memory>
#include <optional>
#include <utility>
#include <vector>

#ifdef _WIN32
#define NOMINMAX
#include <Windows.h>
#endif

namespace selfservice::pass_thru
{

#ifdef _WIN32
    namespace
    {
        std::string formatWindowsError(const DWORD code)
        {
            LPTSTR buffer = nullptr;
            const DWORD flags = FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS;
            const DWORD size = FormatMessageA(flags, nullptr, code, 0, reinterpret_cast<LPSTR>(&buffer), 0, nullptr);
            std::string message;
            if (size != 0U && buffer != nullptr)
            {
                message.assign(buffer, size);
                LocalFree(buffer);
            }
            else
            {
                message = "Windows error code: " + std::to_string(code);
            }
            return message;
        }

        std::wstring toWide(const std::string &path)
        {
            if (path.empty())
            {
                return std::wstring();
            }
            const int length = MultiByteToWideChar(CP_UTF8, 0, path.c_str(), static_cast<int>(path.size()), nullptr, 0);
            if (length <= 0)
            {
                return std::wstring();
            }
            std::wstring wide(static_cast<std::size_t>(length), L'\0');
            MultiByteToWideChar(CP_UTF8, 0, path.c_str(), static_cast<int>(path.size()), wide.data(), length);
            return wide;
        }

        std::string formatJ2534Error(const long code)
        {
            return std::string("J2534 error code: ") + std::to_string(code);
        }

        constexpr long kStatusNoError = 0L;
        constexpr long kErrBufferEmpty = 7L;
        constexpr std::size_t kMaxPayloadLength = 4128ULL;
        constexpr unsigned long kDefaultReadBatch = 16UL;

        struct NativeMessage
        {
            unsigned long ProtocolID;
            unsigned long RxStatus;
            unsigned long TxFlags;
            unsigned long Timestamp;
            unsigned long DataSize;
            unsigned long ExtraDataIndex;
            std::array<std::uint8_t, kMaxPayloadLength> Data;
        };
    } // namespace
#endif

    struct PassThruBridge::Impl
    {
        Impl() = default;
        Impl(const Impl &) = delete;
        Impl &operator=(const Impl &) = delete;
        Impl(Impl &&) = delete;
        Impl &operator=(Impl &&) = delete;

        ~Impl()
        {
#ifdef _WIN32
            if (library != nullptr)
            {
                FreeLibrary(library);
                library = nullptr;
            }
#endif
        }

#ifdef _WIN32
        using J2534Result = long;
        using PassThruOpenFn = J2534Result(__stdcall *)(void *, unsigned long *);
        using PassThruCloseFn = J2534Result(__stdcall *)(unsigned long);
        using PassThruConnectFn = J2534Result(__stdcall *)(unsigned long, unsigned long, unsigned long, unsigned long, unsigned long *);
        using PassThruDisconnectFn = J2534Result(__stdcall *)(unsigned long);
        using PassThruReadMsgsFn = J2534Result(__stdcall *)(unsigned long, void *, unsigned long *, unsigned long);
        using PassThruWriteMsgsFn = J2534Result(__stdcall *)(unsigned long, const void *, unsigned long *, unsigned long);
        using PassThruIoctlFn = J2534Result(__stdcall *)(unsigned long, unsigned long, void *, void *);

        HMODULE library{nullptr};
        PassThruOpenFn passThruOpen{nullptr};
        PassThruCloseFn passThruClose{nullptr};
        PassThruConnectFn passThruConnect{nullptr};
        PassThruDisconnectFn passThruDisconnect{nullptr};
        PassThruReadMsgsFn passThruReadMsgs{nullptr};
        PassThruWriteMsgsFn passThruWriteMsgs{nullptr};
        PassThruIoctlFn passThruIoctl{nullptr};

        unsigned long deviceId{0};
        unsigned long channelId{0};
        unsigned long protocolId{0};

        void resetBindings()
        {
            passThruOpen = nullptr;
            passThruClose = nullptr;
            passThruConnect = nullptr;
            passThruDisconnect = nullptr;
            passThruReadMsgs = nullptr;
            passThruWriteMsgs = nullptr;
            passThruIoctl = nullptr;
        }
#endif
    };

    PassThruBridge::PassThruBridge() : impl_(new Impl()) {}

    PassThruBridge::~PassThruBridge()
    {
        if (impl_ != nullptr)
        {
            std::ignore = close();
            delete impl_;
            impl_ = nullptr;
        }
    }

    PassThruBridge::PassThruBridge(PassThruBridge &&other) noexcept : impl_(other.impl_)
    {
        other.impl_ = nullptr;
    }

    PassThruBridge &PassThruBridge::operator=(PassThruBridge &&other) noexcept
    {
        if (this != &other)
        {
            if (impl_ != nullptr)
            {
                std::ignore = close();
                delete impl_;
            }
            impl_ = other.impl_;
            other.impl_ = nullptr;
        }
        return *this;
    }

    OperationResult PassThruBridge::open(const std::string &driverPath)
    {
        if (impl_ == nullptr)
        {
            return {BridgeStatus::DriverError, std::string("Bridge not initialized")};
        }

#ifdef _WIN32
        if (impl_->library != nullptr)
        {
            return {BridgeStatus::InvalidState, std::string("Driver already open")};
        }

        impl_->resetBindings();
        impl_->deviceId = 0;
        impl_->channelId = 0;
        impl_->protocolId = 0;

        const std::wstring wide = toWide(driverPath);
        if (wide.empty())
        {
            return {BridgeStatus::InvalidArgument, std::string("Driver path is empty or invalid")};
        }

        HMODULE handle = LoadLibraryW(wide.c_str());
        if (handle == nullptr)
        {
            const DWORD error = GetLastError();
            return {BridgeStatus::DriverError, formatWindowsError(error)};
        }

        std::array<std::pair<const char *, FARPROC *>, 7> requiredSymbols{{
            {"PassThruOpen", reinterpret_cast<FARPROC *>(&impl_->passThruOpen)},
            {"PassThruClose", reinterpret_cast<FARPROC *>(&impl_->passThruClose)},
            {"PassThruConnect", reinterpret_cast<FARPROC *>(&impl_->passThruConnect)},
            {"PassThruDisconnect", reinterpret_cast<FARPROC *>(&impl_->passThruDisconnect)},
            {"PassThruReadMsgs", reinterpret_cast<FARPROC *>(&impl_->passThruReadMsgs)},
            {"PassThruWriteMsgs", reinterpret_cast<FARPROC *>(&impl_->passThruWriteMsgs)},
            {"PassThruIoctl", reinterpret_cast<FARPROC *>(&impl_->passThruIoctl)},
        }};

        for (auto &[symbol, target] : requiredSymbols)
        {
            FARPROC proc = GetProcAddress(handle, symbol);
            if (proc == nullptr)
            {
                FreeLibrary(handle);
                const DWORD error = GetLastError();
                return {BridgeStatus::DriverError, std::string("Missing symbol ") + symbol + ": " + formatWindowsError(error)};
            }
            *target = proc;
        }

        unsigned long deviceId = 0;
        const auto openResult = impl_->passThruOpen != nullptr ? impl_->passThruOpen(nullptr, &deviceId) : -1L;
        if (openResult != kStatusNoError)
        {
            impl_->resetBindings();
            impl_->protocolId = 0;
            FreeLibrary(handle);
            return {BridgeStatus::DriverError, formatJ2534Error(openResult)};
        }

        impl_->library = handle;
        impl_->deviceId = deviceId;
        return {BridgeStatus::Success, std::nullopt};
#else
        (void)driverPath;
        return {BridgeStatus::Unimplemented, std::string("PassThru bridge available only on Windows in Stage 1")};
#endif
    }

    OperationResult PassThruBridge::close()
    {
        if (impl_ == nullptr)
        {
            return {BridgeStatus::DriverError, std::string("Bridge not initialized")};
        }

#ifdef _WIN32
        if (impl_->library == nullptr)
        {
            return {BridgeStatus::Success, std::nullopt};
        }

        std::optional<std::string> driverError;

        if (impl_->channelId != 0 && impl_->passThruDisconnect != nullptr)
        {
            const auto disconnectResult = impl_->passThruDisconnect(impl_->channelId);
            if (disconnectResult != kStatusNoError)
            {
                driverError = formatJ2534Error(disconnectResult);
            }
        }

        if (impl_->deviceId != 0 && impl_->passThruClose != nullptr)
        {
            const auto closeResult = impl_->passThruClose(impl_->deviceId);
            if (closeResult != kStatusNoError && !driverError.has_value())
            {
                driverError = formatJ2534Error(closeResult);
            }
        }

        const BOOL freed = FreeLibrary(impl_->library);
        if (freed == 0 && !driverError.has_value())
        {
            driverError = formatWindowsError(GetLastError());
        }

        impl_->library = nullptr;
        impl_->resetBindings();
        impl_->deviceId = 0;
        impl_->channelId = 0;
        impl_->protocolId = 0;

        if (driverError.has_value())
        {
            return {BridgeStatus::DriverError, driverError};
        }

        return {BridgeStatus::Success, std::nullopt};
#else
        return {BridgeStatus::Unimplemented, std::string("PassThru bridge available only on Windows in Stage 1")};
#endif
    }

    OperationResult PassThruBridge::connect(std::uint32_t protocolId, std::uint32_t flags, std::uint32_t baudRate)
    {
        if (impl_ == nullptr)
        {
            return {BridgeStatus::DriverError, std::string("Bridge not initialized")};
        }

#ifdef _WIN32
        if (impl_->library == nullptr || impl_->passThruConnect == nullptr)
        {
            return {BridgeStatus::InvalidState, std::string("Driver is not open")};
        }

        if (impl_->deviceId == 0)
        {
            return {BridgeStatus::InvalidState, std::string("PassThru device not opened")};
        }

        if (impl_->channelId != 0)
        {
            return {BridgeStatus::InvalidState, std::string("Channel already connected")};
        }

        unsigned long channelId = 0;
        const auto result = impl_->passThruConnect(impl_->deviceId, protocolId, flags, baudRate, &channelId);
        if (result != kStatusNoError)
        {
            return {BridgeStatus::DriverError, formatJ2534Error(result)};
        }

        impl_->channelId = channelId;
        impl_->protocolId = protocolId;
        return {BridgeStatus::Success, std::nullopt};
#else
        (void)protocolId;
        (void)flags;
        (void)baudRate;
        return {BridgeStatus::Unimplemented, std::string("PassThru bridge available only on Windows in Stage 1")};
#endif
    }

    OperationResult PassThruBridge::disconnect()
    {
        if (impl_ == nullptr)
        {
            return {BridgeStatus::DriverError, std::string("Bridge not initialized")};
        }

#ifdef _WIN32
        if (impl_->library == nullptr)
        {
            return {BridgeStatus::InvalidState, std::string("Driver is not open")};
        }

        if (impl_->channelId == 0)
        {
            return {BridgeStatus::Success, std::nullopt};
        }

        if (impl_->passThruDisconnect == nullptr)
        {
            return {BridgeStatus::DriverError, std::string("Disconnect function not available")};
        }

        const auto result = impl_->passThruDisconnect(impl_->channelId);
        if (result != kStatusNoError)
        {
            return {BridgeStatus::DriverError, formatJ2534Error(result)};
        }

        impl_->channelId = 0;
        impl_->protocolId = 0;
        return {BridgeStatus::Success, std::nullopt};
#else
        return {BridgeStatus::Unimplemented, std::string("PassThru bridge available only on Windows in Stage 1")};
#endif
    }

    OperationResult PassThruBridge::readMessages(std::vector<Message> &out, std::uint32_t timeoutMs)
    {
        if (impl_ == nullptr)
        {
            return {BridgeStatus::DriverError, std::string("Bridge not initialized")};
        }

#ifdef _WIN32
        out.clear();

        if (impl_->library == nullptr || impl_->passThruReadMsgs == nullptr)
        {
            return {BridgeStatus::InvalidState, std::string("Driver is not open")};
        }

        if (impl_->channelId == 0)
        {
            return {BridgeStatus::InvalidState, std::string("Channel is not connected")};
        }

        const std::size_t capacityHint = out.capacity();
        const std::size_t requestedCount = capacityHint > 0 ? std::clamp<std::size_t>(capacityHint, static_cast<std::size_t>(1), static_cast<std::size_t>(kDefaultReadBatch)) : static_cast<std::size_t>(kDefaultReadBatch);

        std::vector<NativeMessage> buffer(requestedCount);
        unsigned long numMsgs = static_cast<unsigned long>(buffer.size());
        const auto result = impl_->passThruReadMsgs(impl_->channelId, buffer.data(), &numMsgs, timeoutMs);

        if (result != kStatusNoError)
        {
            if (result == kErrBufferEmpty)
            {
                return {BridgeStatus::Success, std::nullopt};
            }
            return {BridgeStatus::DriverError, formatJ2534Error(result)};
        }

        if (numMsgs == 0)
        {
            return {BridgeStatus::Success, std::nullopt};
        }

        if (numMsgs > buffer.size())
        {
            numMsgs = static_cast<unsigned long>(buffer.size());
        }

        out.reserve(numMsgs);
        for (unsigned long index = 0; index < numMsgs; ++index)
        {
            const NativeMessage &native = buffer[static_cast<std::size_t>(index)];
            if (native.DataSize > native.Data.size())
            {
                return {BridgeStatus::DriverError, std::string("Driver reported payload larger than buffer")};
            }

            const std::size_t dataLength = static_cast<std::size_t>(native.DataSize);

            Message message;
            message.flags = native.RxStatus;
            message.timestamp = native.Timestamp;
            message.payload.assign(native.Data.begin(), native.Data.begin() + static_cast<std::ptrdiff_t>(dataLength));
            out.emplace_back(std::move(message));
        }

        return {BridgeStatus::Success, std::nullopt};
#else
        (void)timeoutMs;
        return {BridgeStatus::Unimplemented, std::string("PassThru bridge available only on Windows in Stage 1")};
#endif
    }

    OperationResult PassThruBridge::writeMessages(const std::vector<Message> &in, std::uint32_t timeoutMs)
    {
        if (impl_ == nullptr)
        {
            return {BridgeStatus::DriverError, std::string("Bridge not initialized")};
        }

#ifdef _WIN32
        if (in.empty())
        {
            return {BridgeStatus::InvalidArgument, std::string("No messages to send")};
        }

        if (impl_->library == nullptr || impl_->passThruWriteMsgs == nullptr)
        {
            return {BridgeStatus::InvalidState, std::string("Driver is not open")};
        }

        if (impl_->channelId == 0)
        {
            return {BridgeStatus::InvalidState, std::string("Channel is not connected")};
        }

        std::vector<NativeMessage> buffer(in.size());
        for (std::size_t i = 0; i < in.size(); ++i)
        {
            const Message &source = in[i];
            NativeMessage &native = buffer[i];
            if (source.payload.size() > native.Data.size())
            {
                return {BridgeStatus::InvalidArgument, std::string("Message payload exceeds J2534 limit")};
            }

            const std::size_t dataLength = source.payload.size();

            native.ProtocolID = impl_->protocolId;
            native.RxStatus = 0;
            native.TxFlags = source.flags;
            native.Timestamp = 0;
            native.DataSize = static_cast<unsigned long>(dataLength);
            native.ExtraDataIndex = 0;
            std::copy_n(source.payload.begin(), dataLength, native.Data.begin());
        }

        unsigned long numMsgs = static_cast<unsigned long>(buffer.size());
        const auto result = impl_->passThruWriteMsgs(impl_->channelId, buffer.data(), &numMsgs, timeoutMs);
        if (result != kStatusNoError)
        {
            return {BridgeStatus::DriverError, formatJ2534Error(result)};
        }

        if (numMsgs != buffer.size())
        {
            return {BridgeStatus::DriverError, std::string("Driver wrote fewer messages than requested")};
        }

        return {BridgeStatus::Success, std::nullopt};
#else
        (void)in;
        (void)timeoutMs;
        return {BridgeStatus::Unimplemented, std::string("PassThru bridge available only on Windows in Stage 1")};
#endif
    }

    OperationResult PassThruBridge::ioctl(std::uint32_t ioctlId, const std::vector<std::uint8_t> &payload)
    {
        if (impl_ == nullptr)
        {
            return {BridgeStatus::DriverError, std::string("Bridge not initialized")};
        }

#ifdef _WIN32
        if (impl_->library == nullptr || impl_->passThruIoctl == nullptr)
        {
            return {BridgeStatus::InvalidState, std::string("Driver is not open")};
        }

        if (impl_->channelId == 0)
        {
            return {BridgeStatus::InvalidState, std::string("Channel is not connected")};
        }

        void *inputPtr = nullptr;
        if (!payload.empty())
        {
            inputPtr = const_cast<std::uint8_t *>(payload.data());
        }

        const auto result = impl_->passThruIoctl(impl_->channelId, ioctlId, inputPtr, nullptr);
        if (result != kStatusNoError)
        {
            return {BridgeStatus::DriverError, formatJ2534Error(result)};
        }

        return {BridgeStatus::Success, std::nullopt};
#else
        (void)ioctlId;
        (void)payload;
        return {BridgeStatus::Unimplemented, std::string("PassThru bridge available only on Windows in Stage 1")};
#endif
    }

} // namespace selfservice::pass_thru
