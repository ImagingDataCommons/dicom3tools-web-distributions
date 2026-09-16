// Multi-tool dispatcher: one wasm binary hosting every dicom3tools program,
// so the ~18MB of shared dictionary and IOD tables is paid for only once.
// Each tool's main() was renamed to <tool>_main at compile time.

#include <cstring>
#include <cstdio>

#define TOOL(n) extern int n##_main(int, char **);
#include "toollist.h"
#undef TOOL

namespace {
struct Tool { const char *name; int (*fn)(int, char **); };
const Tool tools[] = {
#define TOOL(n) { #n, n##_main },
#include "toollist.h"
#undef TOOL
};
}

int main(int argc, char **argv)
{
	if (argc < 2) {
		fprintf(stderr, "usage: <toolname> [args ...]\n");
		return 2;
	}
	for (unsigned i = 0; i < sizeof(tools)/sizeof(tools[0]); ++i) {
		if (strcmp(tools[i].name, argv[1]) == 0) {
			return tools[i].fn(argc - 1, argv + 1);
		}
	}
	fprintf(stderr, "unknown tool: %s\n", argv[1]);
	return 2;
}
