cmake_minimum_required(VERSION 3.16)

add_library(mocks INTERFACE)
target_include_directories(mocks INTERFACE ${CMAKE_CURRENT_LIST_DIR})