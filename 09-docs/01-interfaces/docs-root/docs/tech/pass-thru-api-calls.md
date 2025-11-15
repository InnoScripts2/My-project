# J2534 PassThru вызовы WinForms-приложения

## Используемые функции
| Функция | Контекст вызова | Параметры и значения | Комментарии для миграции |
|---------|-----------------|----------------------|--------------------------|
| `PassThruOpen` | `lib/Interface/connectSelectedJ2534Device.cs` при переходе кнопки «Connect» | `name = nullptr`, `deviceId` — выходной `uint` | DLL выбирается через реестр `PassThruSupport.04.04`; после загрузки вызывается `PassThruOpen` без псевдонима устройства. |
| `PassThruConnect` | `connectSelectedJ2534Device.cs` (основной поток подключения) | Комбинации: <br>• `ProtocolID.ISO15765`, `ConnectFlag.NONE`, `BaudRate.CAN_500000`<br>• `ProtocolID.ISO15765`, `ConnectFlag.CAN_29BIT_ID`, `BaudRate.CAN_500000`<br>• `ProtocolID.ISO15765_PS`, `ConnectFlag.NONE`, `BaudRate.CAN_125000`<br>• `ProtocolID.CAN`, `ConnectFlag.NONE`, `BaudRate.CAN_500000`<br>• `ProtocolID.CAN`, `ConnectFlag.CAN_29BIT_ID`, `BaudRate.CAN_500000`<br>• `ProtocolID.CAN_PS`, `ConnectFlag.NONE`, `BaudRate.CAN_125000` | Выбор влияет на pin mapping (HS/MS CAN). Значения условий зависят от UI-флагов `highSpeedCan` и `checkBox29BitId`. |
| `PassThruStartMsgFilter` | • `connectSelectedJ2534Device.cs` — настройка flow control (FilterType.FLOW_CONTROL_FILTER)<br>• `AlphaRomeoFifteen.cs` — поток «Read all msgs» (FilterType.PASS_FILTER)<br>• `Interface/CanSniffer.cs` — модуль CAN Sniffer | Маски и шаблоны составляются из массивов длиной 4 байта. Используются два варианта флагов: `TxFlag.NONE` и `TxFlag.CAN_29BIT_ID`. `FlowPtr` либо `IntPtr.Zero`, либо содержит ответный ID. | После вызова код вручную освобождает `IntPtr` через `Marshal.FreeHGlobal`. Нужно предусмотреть RAII-абстракции в Kotlin/C++. |
| `PassThruWriteMsgs` | • `sendPassThruMsg.cs` (универсальная отправка UDS/OBD команд)<br>• `Protocol/0x23 readMemoryByAddress.cs` | `numMsgs = 1`, `timeout = 0`. Сообщения собираются через `PassThruMsg(ProtocolID.ISO15765, TxFlag.ISO15765_FRAME_PAD, payload)`. | Таймаут «0» используется как fire-and-forget; новые клиенты должны поддерживать аналогичный режим. |
| `PassThruReadMsgs` | • `sendPassThruMsg.cs` (`timeout = 2000`)<br>• `receivePassThruMsg.cs` (`timeout = 2000`)<br>• `AlphaRomeoFifteen.cs` поток чтения (`timeout = 60`)<br>• `Protocol/0x23 readMemoryByAddress.cs` (`timeout = 20`) | `numMsgs` обычно `1` (иногда цикл повтора). Возврат конвертируется через `PassThruMsg.AsMsgList`. | Обработка статусов RX: фильтрация `TX_INDICATION_SUCCESS`, `TX_MSG_TYPE`, `ISO15765_ADDR_TYPE`, `START_OF_MESSAGE`. |
| `PassThruIoctl` | Закомментированный блок в `connectSelectedJ2534Device.cs` для MS-CAN (`SET_CONFIG`) | `ioctlId = SET_CONFIG`, `input`/`output` — указатели на `SConfigList` с параметром `J1962_PINS`. | В прод-коде отключено, но фиксирует требование выставлять pin select через IOCTL. Нужно реализовать легальный аналог для Kotlin. |
| `PassThruDisconnect` | `connectSelectedJ2534Device.cs` при нажатии кнопки «Disconnect» | `channelId` текущего сеанса | Вызывается перед `PassThruClose`. |
| `PassThruClose` | `connectSelectedJ2534Device.cs` после `PassThruDisconnect` | `deviceId` ранее открытого устройства | Закрывает DLL, логирует статус. |

## Функции, объявленные, но не используемые в WinForms-коде
- `PassThruStartPeriodicMsg`, `PassThruStopPeriodicMsg`
- `PassThruStopMsgFilter`
- `PassThruReadVersion`
- `PassThruGetLastError`
- `PassThruScanForDevices`, `PassThruGetNextDevice`
- `PassThruLogicalConnect`, `PassThruLogicalDisconnect`, `PassThruSelect`
- `PassThruQueueMsgs`

Эти делегаты присутствуют в обёртке `lib/Interface/J2534.cs`, но вызовы отсутствуют. Если Kotlin-клиенту потребуется расширенный функционал (например, периодические сообщения), применяем новые контрактные точки поверх JNI.
