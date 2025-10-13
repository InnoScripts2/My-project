cmake_minimum_required(VERSION 3.22)
project(selfservice_obd LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(selfservice_obd STATIC src/Core.cpp)
target_include_directories(selfservice_obd
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
)
target_compile_features(selfservice_obd PUBLIC cxx_std_20)

option(SELF_SERVICE_BUILD_TESTS "Enable C++ unit tests" OFF)
if(SELF_SERVICE_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()
