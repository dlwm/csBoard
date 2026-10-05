# Third-party notices

Copyright (C) 2026 Colvin Chen

## Licensing scope

Original CSBoard code and documentation use `GPL-3.0-only` (see `LICENSE`),
unless stated otherwise. Third-party components retain their own licenses.
Bundled game-derived NAV data remains subject to its original rightsholder's
terms and is outside the GPL grant unless explicitly licensed otherwise.

## Components

| Component | License |
| --- | --- |
| React / React DOM, Three.js / three-mesh-bvh | MIT |
| Yjs / y-websocket / y-protocols / lib0, ws | MIT |
| Electron | MIT and bundled component licenses |
| [Source 2 Viewer / ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat) | MIT; desktop converter includes its license and attribution |
| Capacitor / App / Screen Orientation | MIT |
| opus-decoder / @wasm-audio-decoders/common / simple-yenc | MIT; bundled libopus: BSD-3-Clause; puff: zlib |
| dlwm/demoinfocs (based on markus-wa/demoinfocs-golang) | MIT |
| modernc.org/sqlite | BSD-3-Clause and bundled component licenses; SQLite is public domain |
| Space Grotesk / DM Mono | OFL-1.1 |
| CS2OpenDev radar overview reference | MIT |
| Vite / @vitejs/plugin-react / electron-builder | MIT |
| Wrangler | MIT OR Apache-2.0 |

Preserve Electron's accompanying `LICENSES.chromium.html` and the generated Go
license inventories distributed with parser and storage artifacts. This page
covers direct components, fonts and the radar reference, not all transitive
dependencies. Versions and parser source revisions are recorded in the lockfile,
Go modules and `native/parser/source.json`.

## MIT notices

The following copyright notices share the MIT terms reproduced below.

```text
opus-decoder / @wasm-audio-decoders/common / simple-yenc
Copyright 2021-2026 Ethan Halsall

react 19.2.8
Copyright (c) Meta Platforms, Inc. and affiliates.

react-dom 19.2.8
Copyright (c) Meta Platforms, Inc. and affiliates.

three 0.185.1
Copyright © 2010-2026 three.js authors

three-mesh-bvh 0.9.14
Copyright (c) 2018 Garrett Johnson

yjs 13.6.32
Copyright (c) 2023
  - Kevin Jahns <kevin.jahns@protonmail.com>.
  - Chair of Computer Science 5 (Databases & Information Systems), RWTH Aachen University, Germany

y-websocket 3.1.0
Copyright (c) 2025 Kevin Jahns <kevin.jahns@protonmail.com>.

y-protocols 1.0.7
Copyright (c) 2019 Kevin Jahns <kevin.jahns@protonmail.com>.

lib0 0.2.117
Copyright (c) 2019 Kevin Jahns <kevin.jahns@protonmail.com>.

ws 8.21.3
Copyright (c) 2011 Einar Otto Stangvik <einaros@gmail.com>
Copyright (c) 2013 Arnout Kazemier and contributors
Copyright (c) 2016 Luigi Pinca and contributors

electron 44.2.0
Copyright (c) Electron contributors
Copyright (c) 2013-2020 GitHub Inc.

Capacitor
Copyright (c) 2017-present Drifty Co.

Capacitor App / Screen Orientation
Copyright 2020-present Ionic
https://ionic.io

CS2OpenDev radar overview reference
Copyright (c) 2026 CS2OpenDev
```

Radar reference source: [CS2OpenDev/CS2OpenDev-Docs](https://github.com/CS2OpenDev/CS2OpenDev-Docs),
revision `3d82674b31c75704586a7ca232aa8c734ffd3261`, `docs/generated/data/maps.json`.
The extracted table supplies approximate label anchors, not map artwork or
complete callout boundaries.

### MIT License

```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Font notices

The following fonts share the SIL Open Font License 1.1 reproduced below.

```text
@fontsource/space-grotesk 5.3.0
Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk)

@fontsource/dm-mono 5.3.0
Copyright 2020 The DM Mono Project Authors (https://www.github.com/googlefonts/dm-mono) DMMono-LightItalic.ttf: Copyright 2020 The DM Mono Project Authors (https://www.github.com/googlefonts/dm-mono) DMMono-Regular.ttf: Copyright 2020 The DM Mono Project Authors (https://www.github.com/googlefonts/dm-mono) DMMono-Italic.ttf: Copyright 2020 The DM Mono Project Authors (https://www.github.com/googlefonts/dm-mono) DMMono-Medium.ttf: Copyright 2020 The DM Mono Project Authors (https://www.github.com/googlefonts/dm-mono) DMMono-MediumItalic.ttf: Copyright 2020 The DM Mono Project Authors (https://www.github.com/googlefonts/dm-mono)
```

### SIL Open Font License 1.1

```text
-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## Voice decoder notices

### libopus

```text
Copyright 2001-2023 Xiph.Org, Skype Limited, Octasic,
                    Jean-Marc Valin, Timothy B. Terriberry,
                    CSIRO, Gregory Maxwell, Mark Borgerding,
                    Erik de Castro Lopo, Mozilla, Amazon

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

- Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.

- Redistributions in binary form must reproduce the above copyright
notice, this list of conditions and the following disclaimer in the
documentation and/or other materials provided with the distribution.

- Neither the name of Internet Society, IETF or IETF Trust, nor the
names of specific contributors, may be used to endorse or promote
products derived from this software without specific prior written
permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER
OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Opus is subject to the royalty-free patent licenses which are
specified at:

Xiph.Org Foundation:
https://datatracker.ietf.org/ipr/1524/

Microsoft Corporation:
https://datatracker.ietf.org/ipr/1914/

Broadcom Corporation:
https://datatracker.ietf.org/ipr/1526/
```

### puff

```text
Copyright (C) 2002-2013 Mark Adler, all rights reserved
  version 2.3, 21 Jan 2013

  This software is provided 'as-is', without any express or implied
  warranty.  In no event will the author be held liable for any damages
  arising from the use of this software.

  Permission is granted to anyone to use this software for any purpose,
  including commercial applications, and to alter it and redistribute it
  freely, subject to the following restrictions:

  1. The origin of this software must not be misrepresented; you must not
     claim that you wrote the original software. If you use this software
     in a product, an acknowledgment in the product documentation would be
     appreciated but is not required.
  2. Altered source versions must be plainly marked as such, and must not be
     misrepresented as being the original software.
  3. This notice may not be removed or altered from any source distribution.

  Mark Adler    madler@alumni.caltech.edu
```
