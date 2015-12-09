SHELL := /bin/bash
MAKEFLAGS := s

js_head := src/head.js
js_tail := $(filter-out $(js_head),$(wildcard src/*.js))
js_out := build/script.js

pretty_datetime = date +%d\ %b\ %H:%M:%S

.PHONY: all clean

all: $(js_out)

# TODO babel, uglify, maybe eslint
$(js_out): $(js_head) $(js_tail)
	mkdir -p $(@D)
	cat $^ > $@
	printf "($(shell $(pretty_datetime))) made $(@F)\n"

clean:
	rm -rf build/
	printf "($(shell $(pretty_datetime))) unmade build/\n"
