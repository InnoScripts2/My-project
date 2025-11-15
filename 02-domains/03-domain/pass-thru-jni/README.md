# PassThru JNI Bridge

Модуль Stage 1 для реализации C++/JNI-обёртки над J2534 драйверами. Цель — предоставить единый API для Kotlin-клиента (`PassThruClient`) и киоск-агента.

## Структура
- `include/` — публичные заголовки (`selfservice/pass_thru/PassThruBridge.hpp`).
- `src/` — реализация JNI и обёртки над J2534 DLL.
- `CMakeLists.txt` — конфигурация сборки `pass_thru_jni` (shared library).

## Требования
- CMake >= 3.25.
- Компилятор с поддержкой C++20.
- Windows SDK с J2534 заголовками (подключаются в рамках Milestone JNI Core).
- Gradle 8+ для интеграции с Kotlin-модулем (скрипт будет добавлен в процессе Stage 1).

## Сборка (локальная проверка)
```powershell
mkdir build
cd build
cmake -G "Ninja" .. -DCMAKE_BUILD_TYPE=Debug
cmake --build .
```

## Следующие шаги
1. Реализовать обёртку PassThru API (`passThruOpen`, `passThruConnect`, `passThruReadMsgs`, `passThruWriteMsgs`, `passThruIoctl`).
2. Подготовить GoogleTest loopback модуль для Milestone JNI Core.
3. Добавить Gradle-модуль с задачами сборки/публикации артефактов (`libpass_thru_jni.dll`).
4. Интегрировать Java/JNI entry points, соответствующие спецификации `docs/tech/pass-thru-client-spec.md`.

Документ дополняется по мере продвижения Stage 1.
