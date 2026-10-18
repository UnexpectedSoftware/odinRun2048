# Odin Run 2048

A browser merge-runner. The ball rolls forward on its own. Steer it into balls of the same number, jump the spikes, and reach 2048.

Play it at [https://unexpectedsoftware.com/odinRun2048](https://unexpectedsoftware.com/odinRun2048).

This is an original game inspired by the merge-runner genre. It does not use art or levels from Ball Run 2048.

## Controls

| Input | Action |
| --- | --- |
| Left arrow, A | Steer left |
| Right arrow, D | Steer right |
| Space, Up arrow, W | Jump |
| Down arrow, S | Fast-fall |
| Enter or Space | Start, and run again after a fall |
| Drag, then release | Steer on a touch screen |
| Tap | Jump on a touch screen |

Matching numbers merge and double. A different number is knocked aside. Spikes and low barriers drop you one tier. A hit at 2, or leaving the track, ends the run. Reaching 2048 shows a banner and the run continues. The best number and distance stay in `localStorage`.

## Develop

```bash
npm install
npm test
npm run dev
```

```bash
npm run build
npm run preview
```

The production build uses relative asset paths so it can live at `/odinRun2048/`.

## Deploy

The live page is a folder in [unexpectedsoftware.github.io](https://github.com/UnexpectedSoftware/unexpectedsoftware.github.io), which is the site GitHub Pages already serves at `unexpectedsoftware.com`. This repo does not enable its own Pages site, so the two do not fight over that path.

```bash
npm run build
rm -rf ../unexpectedsoftware.github.io/odinRun2048
mkdir -p ../unexpectedsoftware.github.io/odinRun2048
cp -a dist/. ../unexpectedsoftware.github.io/odinRun2048/
```

Commit and push `unexpectedsoftware.github.io`. `www.unexpectedsoftware.com/odinRun2048` redirects to the apex and keeps the path.

## License

Apache-2.0
