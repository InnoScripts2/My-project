# PassThru API — инвентаризация Windows-реализации

Исходники: `блок 4/lib/Interface/J2534.cs`, `J2534_Struct.cs`, `connectSelectedJ2534Device.cs`.

## 1. Обёртки и структуры
- `J2534Functions` / `J2534FunctionsExtended` — управляют загрузкой DLL, выставляют статические делегаты с сигнатурой `StdCall` и транслируют ошибки в `J2534Err`.
- `J2534Device` — описание адаптера (название, библиотека, поддерживаемые протоколы). Используется при выборе DLL (`FunctionLibrary`).
- `PassThruMsg` — фиксированная структура (4 128 байт `Data`) с полями `ProtocolID`, `RxStatus`, `TxFlags`, `Timestamp`, `DataSize`, `ExtraDataIndex`. Требует ручного управления памятью (через `ToIntPtr`/`Marshal.FreeHGlobal`).
- `SConfig`/`SConfigList` — параметры `SET_CONFIG` (`ConfigParameter`), список упаковывается в unmanaged память перед вызовом `Ioctl`.
- `SDEVICE` — буфер для результатов `PassThruGetNextDevice`. В WinForms-версии не сериализуется обратно (используется для подсчёта).

## 2. Основные перечисления
- `ProtocolID`, `ConnectFlag`, `TxFlag`, `RxStatus` — задают протоколы, флаги 29-битных идентификаторов, padding ISO 15765 и т. п.
- `ConfigParameter` — полный список таймингов (P1..P4, W0..W5), ISO 15765 (BS, STmin, WFT), CAN mixed format, выбор пинов `J1962_PINS`.
- `Ioctl` — включает стандартные операции (`GET_CONFIG`, `SET_CONFIG`, `READ_VBATT`, `FAST_INIT`) и расширения (SW-CAN режимы, `OBDX_AvailableDevices`).
- `J2534Err` — все коды статуса (стандарт + вендорские `0x5000+`). Важно для отображения пользователю и логирования.

## 3. Последовательность подключения (WinForms `connectSelectedJ2534Device`)
1. `J2534DeviceFinder.FindInstalledJ2534DLLs()` — формирует список доступных адаптеров.
2. Выбор DLL (`LoadedDevice = list[index]`) и загрузка `Functions.LoadLibrary()`.
3. `PassThruOpen(IntPtr.Zero, ref deviceId)` — открывает адаптер.
4. `PassThruConnect(deviceId, protocol, flags, baud, ref channelId)` — разновидности:
   - HS CAN: `ProtocolID.ISO15765` или `CAN` + `BaudRate.CAN_500000`, опционально `ConnectFlag.CAN_29BIT_ID`;
   - MS CAN: `_PS` варианты (Pin Select) `ISO15765_PS`/`CAN_PS` + `BaudRate.CAN_125000`.
5. `SetConfig` (закомментировано) — устанавливает `ConfigParameter.J1962_PINS` (`0x60E` для HS, `0x30B` для MS). Нужно реализовать в новой версии.
6. `PassThruStartMsgFilter(channelId, FLOW_CONTROL_FILTER, mask, pattern, flow, ref filterId)` — создаёт фильтр для многофреймовых ответов (`PassThruMsg` с маской `FF FF FF FF` и PATTERN/FC значениями из UI).
7. При разрыве соединения: `PassThruDisconnect(channelId)` → `PassThruClose(deviceId)`.

## 4. Поведение J2534FunctionsExtended
| Метод | Назначение | Особенности | JNI слой |
|-------|------------|-------------|----------|
| `PassThruOpen` | получить `deviceId` из DLL | проверяет загрузку DLL, возвращает `ERR_DLL_NOT_LOADED`/`ERR_ACCESS_VIOLATION` | JNI должен транслировать исключения в Kotlin (`DiagnosticsException.OpenFailed`). |
| `PassThruClose` | освободить адаптер | допускает множественные вызовы (возвращает успех при незагруженной DLL) | вызывать в `finally`. |
| `PassThruScanForDevices`, `PassThruGetNextDevice` | enumerate | требуют unmanaged буфера `SDEVICE` | рассмотреть отдельный Kotlin API `scanAdapters()`. |
| `PassThruConnect`/`Disconnect` | открыть канал | принимает `ProtocolID`, `ConnectFlag`, `BaudRate` | в JNI использовать enum → int маппинг. |
| `PassThruReadMsgs`/`WriteMsgs` | обмен сообщениями | `WriteMsgs` ожидает массив `PassThruMsg` в unmanaged памяти | JNI возвращает массив байтов, управляет `Marshal.AllocHGlobal`. |
| `PassThruStartMsgFilter`/`StopMsgFilter` | фильтры | требует ручного освобождения `IntPtr` после вызова | в JNI выделять память через `NewDirectByteBuffer` или ручной malloc/free. |
| `PassThruIoctl` | универсальный вызов | используется для `GET_CONFIG`, `SET_CONFIG`, `READ_VBATT`, SW-CAN | JNI подготовит структурированные буферы (см. `SConfigList`). |
| `FiveBaudInit`/`FastInit` | инициализации ISO 9141/14230 | завёрнуты в `Ioctl` внутри `J2534DllWrapper` | требуется при поддержке K-Line. |
| `ClearTxBuffer`/`ClearRxBuffer` | очистка буферов | в WinForms редко вызываются, но доступны | полезно перед сменой сеансов. |

## 5. Управление памятью
- Все методы, принимающие `IntPtr`, ожидают, что вызывающая сторона выделит unmanaged блок (`Marshal.AllocHGlobal`) и освободит после вызова.
- `PassThruMsg.ToIntPtr()` выделяет буфер, но **не освобождает** его — в WinForms код очищает `Marshal.FreeHGlobal` сразу после `PassThruStartMsgFilter`. В JNI необходимо гарантировать `free` даже при исключениях.
- `SConfigList` / `SByteArray` / `SParamList` работают через `Marshal.StructureToPtr`; в Android-версии стоит заменить на RAII-обёртки (C++ класс с `std::unique_ptr`).

## 6. Требования к JNI API
1. **Управление DLL**: в Android вместо `LoadLibrary(string)` нужно предоставлять слой загрузки `.so` либо прокидывать вызовы к нативной реализации PassThru (не Windows DLL). План: реализовать собственный `libpassthrucore.so` с той же сигнатурой.
2. **Структуры**: зафиксировать соответствие полей `PassThruMsg`, `SConfig`, `SConfigList`, `SParam` и подготовить C++ header с `#pragma pack(push, 1)` для бинарной совместимости.
3. **Ошибки**: таблица `J2534Err` перевести в Kotlin enum/ sealed class. JNI должен возвращать код + сообщение.
4. **Фильтры**: предусмотреть helper в Kotlin, который собирает mask/pattern/flow и освобождает ресурсы через `try/finally`.
5. **Pin Select**: восстановить логику `SetConfig` для выбора пинов HS/MS CAN. Нужен API `setConfig(channelId, Map<ConfigParameter, UInt16>)`.
6. **Device discovery**: на Android discovery будет отличаться (USB/Bluetooth). Документировать, что WinForms реализация опирается на `PassThruScanForDevices`, но в новой архитектуре возможен список из собственной базы.

## 7. Вопросы при переносе
- Замена `Marshal`-основанных вспомогательных методов на C++ RAII.
- Поддержка MS-CAN: в WinForms `SetConfig` закомментирован; необходимо протестировать и интегрировать в новой версии.
- Проверка пинов и скоростей: WinForms использует жёстко заданные `BaudRate` (`CAN_500000`, `CAN_125000`). На Android потребуется конфигурация через JSON/DB.
- Управление фильтрами: текущий код создаёт только один фильтр (`FilterID`). Для многопоточного клиента предусмотреть пул.

## 8. Следующие шаги
- Подготовить C++ заголовок `PassThruTypes.hpp` с определениями `PassThruMsg`, `SConfig`, `SConfigList`, `J2534Err` (pack=1, размеры как в C#).
- Описать Kotlin API (`PassThruClient`) и маппинг ошибок в `docs/tech/pass-thru-client-spec.md` (обновление Stage 1 документа).
- Реализовать черновик `jni_pass_thru` (C++) с методами `openAdapter`, `closeAdapter`, `connectChannel`, `disconnectChannel`, `writeMsgs`, `readMsgs`, `startFilter`, `stopFilter`, `setConfig`, `ioctl`.``