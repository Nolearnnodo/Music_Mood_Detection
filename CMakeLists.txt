cmake_minimum_required(VERSION 3.21)

if(WIN32)
    set(VCPKG_TARGET_TRIPLET x64-windows-static)
endif()

project(MusicMoodCLI LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(MSVC)
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
    add_compile_options("$<$<C_COMPILER_ID:MSVC>:/utf-8>")
    add_compile_options("$<$<CXX_COMPILER_ID:MSVC>:/utf-8>")
endif()

# 1. 查找 VCPKG 依赖
find_package(Eigen3 CONFIG REQUIRED)
find_package(FFTW3f CONFIG REQUIRED)
find_package(FFMPEG REQUIRED)
find_package(ncnn REQUIRED)
find_package(httplib CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(unofficial-sqlite3 CONFIG REQUIRED)

# 3. 源文件
include_directories(src)
set(SOURCE_FILES
        src/main.cpp
        src/core/EmotionPredictor.cpp
)

add_executable(${PROJECT_NAME} ${SOURCE_FILES})
target_include_directories(${PROJECT_NAME} PRIVATE ${FFMPEG_INCLUDE_DIRS})

# 4. 链接库
target_link_libraries(${PROJECT_NAME} PRIVATE
        Eigen3::Eigen
        FFTW3::fftw3f
        ncnn
        httplib::httplib
        nlohmann_json::nlohmann_json
        unofficial::sqlite3::sqlite3
)

if(WIN32)
    target_link_libraries(${PROJECT_NAME} PRIVATE dxcore.lib)
endif()

target_link_directories(${PROJECT_NAME} PRIVATE ${FFMPEG_LIBRARY_DIRS})
target_link_libraries(${PROJECT_NAME} PRIVATE ${FFMPEG_LIBRARIES})
