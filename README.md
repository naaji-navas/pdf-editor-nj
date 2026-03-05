# PDF Editor

A web-based PDF editor built with Next.js. Upload a PDF, view pages, edit or add text, and download the modified file.

## Features

- **Upload & view** — Load a PDF and view all pages with zoom
- **Edit existing text** — Double-click text blocks to edit in place
- **Add new text** — Use the text tool to click on a page and add new text with custom font, size, color, bold, and italic
- **Delete text** — Remove added text or clear new text blocks
- **Download** — Export the modified PDF with your changes applied

## Tech stack

- [Next.js](https://nextjs.org/) 16 (App Router)
- [React](https://react.dev/) 19
- [pdf-lib](https://pdf-lib.js.org/) — create and modify PDFs
- [pdfjs-dist](https://mozilla.github.io/pdf.js/) — render PDF pages to canvas and extract text
- [Tailwind CSS](https://tailwindcss.com/) 4

## Getting started

1. **Clone the repo**
   ```bash
   git clone https://github.com/naaji-navas/pdf-editor.git
   cd pdf-editor
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the dev server**
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000), upload a PDF, and start editing.

## Scripts

| Command   | Description              |
| --------- | ------------------------ |
| `npm run dev`   | Start dev server (port 3000) |
| `npm run build` | Build for production        |
| `npm run start` | Start production server     |
| `npm run lint`  | Run ESLint                  |

## License

MIT — feel free to use and modify for personal or commercial projects.
