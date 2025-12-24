/**
 * ASCII Grid to SVG converter
 *
 * --line N   = line thickness (pixels)
 * --spacing N = grid cell spacing (pixels)
 *
 * For tiling: only FULL-WIDTH horizontal runs and FULL-HEIGHT vertical runs
 * extend to tile boundaries. Internal pattern lines don't extend.
 */

const fs = require('fs');
const path = require('path');

function parseAsciiGrid(ascii) {
  const lines = ascii.trim().split('\n');
  return lines.map(line => [...line].map(char => char === '#' || char === 'X'));
}

function findHorizontalRuns(grid) {
  const runs = [];
  for (let y = 0; y < grid.length; y++) {
    let runStart = null;
    for (let x = 0; x <= grid[y].length; x++) {
      const filled = x < grid[y].length && grid[y][x];
      if (filled && runStart === null) {
        runStart = x;
      } else if (!filled && runStart !== null) {
        runs.push({ x: runStart, y, length: x - runStart, dir: 'h' });
        runStart = null;
      }
    }
  }
  return runs;
}

function findVerticalRuns(grid) {
  const runs = [];
  const height = grid.length;
  const width = Math.max(...grid.map(row => row.length));
  for (let x = 0; x < width; x++) {
    let runStart = null;
    for (let y = 0; y <= height; y++) {
      const filled = y < height && grid[y] && grid[y][x];
      if (filled && runStart === null) {
        runStart = y;
      } else if (!filled && runStart !== null) {
        runs.push({ x, y: runStart, length: y - runStart, dir: 'v' });
        runStart = null;
      }
    }
  }
  return runs;
}

function runsToRects(runs, lineWidth, spacing, gridWidth, gridHeight) {
  return runs.map(run => {
    if (run.dir === 'h') {
      // Only extend if this run spans FULL width (starts at 0, ends at gridWidth)
      const isFullWidth = run.x === 0 && run.length === gridWidth;
      const width = isFullWidth
        ? gridWidth * spacing
        : (run.length - 1) * spacing + lineWidth;
      return {
        x: run.x * spacing,
        y: run.y * spacing,
        width,
        height: lineWidth
      };
    } else {
      // Only extend if this run spans FULL height
      const isFullHeight = run.y === 0 && run.length === gridHeight;
      const height = isFullHeight
        ? gridHeight * spacing
        : (run.length - 1) * spacing + lineWidth;
      return {
        x: run.x * spacing,
        y: run.y * spacing,
        width: lineWidth,
        height
      };
    }
  });
}

function rectsToPath(rects) {
  return rects.map(r => `M${r.x},${r.y}h${r.width}v${r.height}h${-r.width}z`).join('');
}

function asciiToSvg(ascii, options = {}) {
  const { lineWidth = 3, spacing = 3, id = null } = options;

  const grid = parseAsciiGrid(ascii);
  const gridHeight = grid.length;
  const gridWidth = Math.max(...grid.map(row => row.length));

  const hRuns = findHorizontalRuns(grid);
  const vRuns = findVerticalRuns(grid);

  const rects = [
    ...runsToRects(hRuns, lineWidth, spacing, gridWidth, gridHeight),
    ...runsToRects(vRuns, lineWidth, spacing, gridWidth, gridHeight)
  ];

  const pathD = rectsToPath(rects);
  const svgWidth = gridWidth * spacing;
  const svgHeight = gridHeight * spacing;
  const idAttr = id ? ` id="${id}"` : '';

  return `<svg${idAttr} width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  <path d="${pathD}" fill="currentColor"/>
</svg>`;
}

function processFile(inputPath, outputPath, options) {
  const ascii = fs.readFileSync(inputPath, 'utf-8');
  const svg = asciiToSvg(ascii, options);
  fs.writeFileSync(outputPath, svg);
  console.log(`Created: ${outputPath}`);
}

function processAllFiles(options) {
  const baseDir = __dirname;
  const assetsDir = path.join(baseDir, 'assets', 'borders');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  ['border-left', 'border-middle', 'border-right', 'hamburger', 'question-mark'].forEach(file => {
    const input = path.join(baseDir, `${file}.txt`);
    if (fs.existsSync(input)) {
      processFile(input, path.join(assetsDir, `${file}.svg`), { ...options, id: file });
    }
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options = { lineWidth: 3, spacing: 3 };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--line' || args[i] === '-l') options.lineWidth = parseFloat(args[++i]);
    else if (args[i] === '--spacing' || args[i] === '-s') options.spacing = parseFloat(args[++i]);
  }

  console.log(`Line: ${options.lineWidth}px, Spacing: ${options.spacing}px`);
  processAllFiles(options);
  console.log('Done!');
}

module.exports = { asciiToSvg, processFile, processAllFiles };
