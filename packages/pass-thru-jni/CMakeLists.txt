cmake_minimum_required(VERSION 3.25)
project(pass_thru_jni LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(pass_thru_jni SHARED
    src/PassThruBridge.cpp
)

find_package(JNI REQUIRED)

target_include_directories(pass_thru_jni
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
    PRIVATE
        ${JNI_INCLUDE_DIRS}
)

target_link_libraries(pass_thru_jni
    PRIVATE
        ${JNI_LIBRARIES}
)

if(MSVC)
    target_compile_options(pass_thru_jni PRIVATE /W4 /permissive- /EHsc)
else()
    target_compile_options(pass_thru_jni PRIVATE -Wall -Wextra -Wpedantic)
endif()
