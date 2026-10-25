# Third-Party Notices

Clindroid Buddy is a derivative of [opencode](https://github.com/anomalyco/opencode); substantial
portions of this codebase originate from it. opencode's original MIT license text is preserved
verbatim below, and also as a standalone file at [LICENSE-MIT](./LICENSE-MIT).

Clindroid Buddy's local RAG tooling (e.g. the `standard_doc_search` tool) can also optionally use an
embedding model served by `llama-server`, part of the llama.cpp project. Clindroid Buddy starts and
stops `llama-server` as a child process and talks to it over its local HTTP API. Whether these
components are distributed with Clindroid Buddy depends on how it is distributed:

- **CLI binaries**: neither the llama.cpp binary nor any model weights are bundled. The user
  installs `llama-server` separately (e.g. via Homebrew) and supplies their own GGUF model file via
  configuration (`provider.<id>.options.binaryPath` / `modelPath`).
- **Docker image** (built from the `Dockerfile` at the repository root): the image bundles a
  `llama-server` binary built from llama.cpp source at a pinned release tag, and the
  nomic-embed-text-v1.5 GGUF model file described below. Inside the image, these notices are at
  `/usr/share/doc/clindroidbuddy/`.

The notices below are provided for attribution.

## opencode

- Project: https://github.com/anomalyco/opencode
- License: MIT License
- Copyright (c) 2025 opencode

```
MIT License

Copyright (c) 2025 opencode

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

## llama.cpp

- Project: https://github.com/ggml-org/llama.cpp
- License: MIT License
- Copyright (c) 2023-2026 The ggml authors

```
MIT License

Copyright (c) 2023-2026 The ggml authors

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

## nomic-embed-text-v1.5

- Model card: https://huggingface.co/nomic-ai/nomic-embed-text-v1.5
- GGUF distribution: https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF
- License: Apache License 2.0
- Copyright Nomic AI

The Clindroid Buddy Docker image bundles the model file `nomic-embed-text-v1.5.f16.gguf` from
https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF at revision
`0188c9bf409793f810680a5a431e7b899c46104c` (SHA-256
`f7af6f66802f4df86eda10fe9bbcfc75c39562bed48ef6ace719a251cf1c2fdb`). The file is redistributed
unmodified, exactly as published by Nomic AI. Inside the image, it is located in
`/usr/local/share/clindroidbuddy/models/nomic-embed-text-v1.5/` together with the full text of the
Apache License, Version 2.0 (`LICENSE`) and Nomic AI's model card (`README.md`). Nomic AI does not
endorse and is not affiliated with Clindroid Buddy.

The CLI binaries do not bundle model weights; users of the CLI who choose this model download it
themselves and reference it via configuration.

Distributed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0), on
an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
License for the specific language governing permissions and limitations under the License.
