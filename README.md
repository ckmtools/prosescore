# ProseScore

Free browser-based readability analyzer with 8 formulas, sentiment analysis, and SEO scoring.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Live App](https://img.shields.io/badge/Try_it-prosescore.ckmtools.dev-green)](https://prosescore.ckmtools.dev/)

**[Open the live app](https://prosescore.ckmtools.dev/)**

![ProseScore app screenshot](assets/app-screenshot.png)

## Features

### Free

- Flesch-Kincaid readability score
- Word, sentence, and paragraph count
- Reading time estimate
- Character count
- Average word and sentence length
- Grade-level recommendation

### Pro ($3.99/mo or $19.99 lifetime)

- 8 readability formulas (Flesch-Kincaid, Gunning Fog, Coleman-Liau, SMOG, ARI, Dale-Chall, Linsear Write, Spache)
- Consensus grade across all formulas
- Sentiment analysis
- Keyword extraction
- SEO scoring
- Text summarization
- Markdown export
- Analysis history
- File upload (.txt, .md, .docx)
- Dark and light mode

![Feature comparison](assets/feature-comparison.png)

## Privacy

ProseScore runs entirely client-side. No data is sent to any server. Your text never leaves the browser.

## How it works

Paste or upload text. Get instant analysis. Built on [textlens](https://www.npmjs.com/package/textlens). No account needed for free features.

![Analysis preview](assets/analysis-preview.png)

## Tech stack

- Pure HTML, CSS, and JavaScript
- [textlens](https://www.npmjs.com/package/textlens) readability engine
- Hosted on Cloudflare Pages
- Stripe for payments

## License

[MIT](LICENSE)
