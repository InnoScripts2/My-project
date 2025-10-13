#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace selfservice::pass_thru
{

    enum class BridgeStatus
    {
        Success,
        Unimplemented,
        InvalidArgument,
        InvalidState,
        DriverError
    };

    struct Message
    {
        std::vector<std::uint8_t> payload;
        std::uint32_t flags{0};
        std::uint32_t timestamp{0};
    };

    struct OperationResult
    {
        BridgeStatus status{BridgeStatus::Unimplemented};
        std::optional<std::string> message{};
    };

    class PassThruBridge
    {
    public:
        PassThruBridge();
        ~PassThruBridge();

        PassThruBridge(const PassThruBridge &) = delete;
        PassThruBridge &operator=(const PassThruBridge &) = delete;
        PassThruBridge(PassThruBridge &&) noexcept;
        PassThruBridge &operator=(PassThruBridge &&) noexcept;

        [[nodiscard]] OperationResult open(const std::string &driverPath);
        [[nodiscard]] OperationResult close();
        [[nodiscard]] OperationResult connect(std::uint32_t protocolId, std::uint32_t flags, std::uint32_t baudRate);
        [[nodiscard]] OperationResult disconnect();
        [[nodiscard]] OperationResult readMessages(std::vector<Message> &out, std::uint32_t timeoutMs);
        [[nodiscard]] OperationResult writeMessages(const std::vector<Message> &in, std::uint32_t timeoutMs);
        [[nodiscard]] OperationResult ioctl(std::uint32_t ioctlId, const std::vector<std::uint8_t> &payload);

    private:
        struct Impl;
        Impl *impl_{nullptr};
    };

} // namespace selfservice::pass_thru
