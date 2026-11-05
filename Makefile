all: c/pathfinder

c/pathfinder: c/pathfinder.c
	gcc -O2 -Wall -o c/pathfinder c/pathfinder.c

clean:
	rm -f c/pathfinder
