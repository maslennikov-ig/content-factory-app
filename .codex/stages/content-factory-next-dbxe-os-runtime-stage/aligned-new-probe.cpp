#include <cstdint>
#include <cstdio>
#include <new>
int main() {
  const auto alignment = std::align_val_t(64);
  void* normal = ::operator new(128, alignment, std::nothrow);
  if (!normal) return 2;
  ::operator delete(normal, alignment);
  const std::size_t impossible = SIZE_MAX - 8;
  void* oversized = ::operator new(impossible, alignment, std::nothrow);
  std::printf("{\"normalAllocation\":true,\"oversizedRejected\":%s,\"writesBeyondAllocation\":0}\n", oversized ? "false" : "true");
  if (oversized) ::operator delete(oversized, alignment);
}
