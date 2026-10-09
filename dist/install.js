#!/usr/bin/env node
import { createRequire } from "node:module";const require=createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.pnpm/sisteransi@1.0.5/node_modules/sisteransi/src/index.js
var require_src = __commonJS({
  "node_modules/.pnpm/sisteransi@1.0.5/node_modules/sisteransi/src/index.js"(exports, module) {
    "use strict";
    var ESC2 = "\x1B";
    var CSI2 = `${ESC2}[`;
    var beep = "\x07";
    var cursor3 = {
      to(x, y2) {
        if (!y2) return `${CSI2}${x + 1}G`;
        return `${CSI2}${y2 + 1};${x + 1}H`;
      },
      move(x, y2) {
        let ret = "";
        if (x < 0) ret += `${CSI2}${-x}D`;
        else if (x > 0) ret += `${CSI2}${x}C`;
        if (y2 < 0) ret += `${CSI2}${-y2}A`;
        else if (y2 > 0) ret += `${CSI2}${y2}B`;
        return ret;
      },
      up: (count = 1) => `${CSI2}${count}A`,
      down: (count = 1) => `${CSI2}${count}B`,
      forward: (count = 1) => `${CSI2}${count}C`,
      backward: (count = 1) => `${CSI2}${count}D`,
      nextLine: (count = 1) => `${CSI2}E`.repeat(count),
      prevLine: (count = 1) => `${CSI2}F`.repeat(count),
      left: `${CSI2}G`,
      hide: `${CSI2}?25l`,
      show: `${CSI2}?25h`,
      save: `${ESC2}7`,
      restore: `${ESC2}8`
    };
    var scroll = {
      up: (count = 1) => `${CSI2}S`.repeat(count),
      down: (count = 1) => `${CSI2}T`.repeat(count)
    };
    var erase3 = {
      screen: `${CSI2}2J`,
      up: (count = 1) => `${CSI2}1J`.repeat(count),
      down: (count = 1) => `${CSI2}J`.repeat(count),
      line: `${CSI2}2K`,
      lineEnd: `${CSI2}K`,
      lineStart: `${CSI2}1K`,
      lines(count) {
        let clear = "";
        for (let i2 = 0; i2 < count; i2++)
          clear += this.line + (i2 < count - 1 ? cursor3.up() : "");
        if (count)
          clear += cursor3.left;
        return clear;
      }
    };
    module.exports = { cursor: cursor3, scroll, erase: erase3, beep };
  }
});

// tools/install.ts
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// node_modules/.pnpm/@clack+core@1.5.1/node_modules/@clack/core/dist/index.mjs
import { stdout, stdin } from "node:process";
import l__default from "node:readline";

// node_modules/.pnpm/fast-string-truncated-width@3.0.3/node_modules/fast-string-truncated-width/dist/utils.js
var getCodePointsLength = /* @__PURE__ */ (() => {
  const SURROGATE_PAIR_RE = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
  return (input) => {
    let surrogatePairsNr = 0;
    SURROGATE_PAIR_RE.lastIndex = 0;
    while (SURROGATE_PAIR_RE.test(input)) {
      surrogatePairsNr += 1;
    }
    return input.length - surrogatePairsNr;
  };
})();
var isFullWidth = (x) => {
  return x === 12288 || x >= 65281 && x <= 65376 || x >= 65504 && x <= 65510;
};
var isWideNotCJKTNotEmoji = (x) => {
  return x === 8987 || x === 9001 || x >= 12272 && x <= 12287 || x >= 12289 && x <= 12350 || x >= 12441 && x <= 12543 || x >= 12549 && x <= 12591 || x >= 12593 && x <= 12686 || x >= 12688 && x <= 12771 || x >= 12783 && x <= 12830 || x >= 12832 && x <= 12871 || x >= 12880 && x <= 19903 || x >= 65040 && x <= 65049 || x >= 65072 && x <= 65106 || x >= 65108 && x <= 65126 || x >= 65128 && x <= 65131 || x >= 127488 && x <= 127490 || x >= 127504 && x <= 127547 || x >= 127552 && x <= 127560 || x >= 131072 && x <= 196605 || x >= 196608 && x <= 262141;
};

// node_modules/.pnpm/fast-string-truncated-width@3.0.3/node_modules/fast-string-truncated-width/dist/index.js
var ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]|\u001b\]8;[^;]*;.*?(?:\u0007|\u001b\u005c)/y;
var CONTROL_RE = /[\x00-\x08\x0A-\x1F\x7F-\x9F]{1,1000}/y;
var CJKT_WIDE_RE = /(?:(?![\uFF61-\uFF9F\uFF00-\uFFEF])[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Tangut}]){1,1000}/yu;
var TAB_RE = /\t{1,1000}/y;
var EMOJI_RE = new RegExp("[\\u{1F1E6}-\\u{1F1FF}]{2}|\\u{1F3F4}[\\u{E0061}-\\u{E007A}]{2}[\\u{E0030}-\\u{E0039}\\u{E0061}-\\u{E007A}]{1,3}\\u{E007F}|(?:\\p{Emoji}\\uFE0F\\u20E3?|\\p{Emoji_Modifier_Base}\\p{Emoji_Modifier}?|\\p{Emoji_Presentation})(?:\\u200D(?:\\p{Emoji_Modifier_Base}\\p{Emoji_Modifier}?|\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F\\u20E3?))*", "yu");
var LATIN_RE = /(?:[\x20-\x7E\xA0-\xFF](?!\uFE0F)){1,1000}/y;
var MODIFIER_RE = new RegExp("\\p{M}+", "gu");
var NO_TRUNCATION = { limit: Infinity, ellipsis: "" };
var getStringTruncatedWidth = (input, truncationOptions = {}, widthOptions = {}) => {
  const LIMIT = truncationOptions.limit ?? Infinity;
  const ELLIPSIS = truncationOptions.ellipsis ?? "";
  const ELLIPSIS_WIDTH = truncationOptions?.ellipsisWidth ?? (ELLIPSIS ? getStringTruncatedWidth(ELLIPSIS, NO_TRUNCATION, widthOptions).width : 0);
  const ANSI_WIDTH = 0;
  const CONTROL_WIDTH = widthOptions.controlWidth ?? 0;
  const TAB_WIDTH = widthOptions.tabWidth ?? 8;
  const EMOJI_WIDTH = widthOptions.emojiWidth ?? 2;
  const FULL_WIDTH_WIDTH = 2;
  const REGULAR_WIDTH = widthOptions.regularWidth ?? 1;
  const WIDE_WIDTH = widthOptions.wideWidth ?? FULL_WIDTH_WIDTH;
  const PARSE_BLOCKS = [
    [LATIN_RE, REGULAR_WIDTH],
    [ANSI_RE, ANSI_WIDTH],
    [CONTROL_RE, CONTROL_WIDTH],
    [TAB_RE, TAB_WIDTH],
    [EMOJI_RE, EMOJI_WIDTH],
    [CJKT_WIDE_RE, WIDE_WIDTH]
  ];
  let indexPrev = 0;
  let index = 0;
  let length = input.length;
  let lengthExtra = 0;
  let truncationEnabled = false;
  let truncationIndex = length;
  let truncationLimit = Math.max(0, LIMIT - ELLIPSIS_WIDTH);
  let unmatchedStart = 0;
  let unmatchedEnd = 0;
  let width = 0;
  let widthExtra = 0;
  outer: while (true) {
    if (unmatchedEnd > unmatchedStart || index >= length && index > indexPrev) {
      const unmatched = input.slice(unmatchedStart, unmatchedEnd) || input.slice(indexPrev, index);
      lengthExtra = 0;
      for (const char of unmatched.replaceAll(MODIFIER_RE, "")) {
        const codePoint = char.codePointAt(0) || 0;
        if (isFullWidth(codePoint)) {
          widthExtra = FULL_WIDTH_WIDTH;
        } else if (isWideNotCJKTNotEmoji(codePoint)) {
          widthExtra = WIDE_WIDTH;
        } else {
          widthExtra = REGULAR_WIDTH;
        }
        if (width + widthExtra > truncationLimit) {
          truncationIndex = Math.min(truncationIndex, Math.max(unmatchedStart, indexPrev) + lengthExtra);
        }
        if (width + widthExtra > LIMIT) {
          truncationEnabled = true;
          break outer;
        }
        lengthExtra += char.length;
        width += widthExtra;
      }
      unmatchedStart = unmatchedEnd = 0;
    }
    if (index >= length) {
      break outer;
    }
    for (let i2 = 0, l = PARSE_BLOCKS.length; i2 < l; i2++) {
      const [BLOCK_RE, BLOCK_WIDTH] = PARSE_BLOCKS[i2];
      BLOCK_RE.lastIndex = index;
      if (BLOCK_RE.test(input)) {
        lengthExtra = BLOCK_RE === CJKT_WIDE_RE ? getCodePointsLength(input.slice(index, BLOCK_RE.lastIndex)) : BLOCK_RE === EMOJI_RE ? 1 : BLOCK_RE.lastIndex - index;
        widthExtra = lengthExtra * BLOCK_WIDTH;
        if (width + widthExtra > truncationLimit) {
          truncationIndex = Math.min(truncationIndex, index + Math.floor((truncationLimit - width) / BLOCK_WIDTH));
        }
        if (width + widthExtra > LIMIT) {
          truncationEnabled = true;
          break outer;
        }
        width += widthExtra;
        unmatchedStart = indexPrev;
        unmatchedEnd = index;
        index = indexPrev = BLOCK_RE.lastIndex;
        continue outer;
      }
    }
    index += 1;
  }
  return {
    width: truncationEnabled ? truncationLimit : width,
    index: truncationEnabled ? truncationIndex : length,
    truncated: truncationEnabled,
    ellipsed: truncationEnabled && LIMIT >= ELLIPSIS_WIDTH
  };
};
var dist_default = getStringTruncatedWidth;

// node_modules/.pnpm/fast-string-width@3.0.2/node_modules/fast-string-width/dist/index.js
var NO_TRUNCATION2 = {
  limit: Infinity,
  ellipsis: "",
  ellipsisWidth: 0
};
var fastStringWidth = (input, options = {}) => {
  return dist_default(input, NO_TRUNCATION2, options).width;
};
var dist_default2 = fastStringWidth;

// node_modules/.pnpm/fast-wrap-ansi@0.2.2/node_modules/fast-wrap-ansi/lib/main.js
var ESC = "\x1B";
var CSI = "\x9B";
var END_CODE = 39;
var ANSI_ESCAPE_BELL = "\x07";
var ANSI_CSI = "[";
var ANSI_OSC = "]";
var ANSI_SGR_TERMINATOR = "m";
var ANSI_ESCAPE_LINK = `${ANSI_OSC}8;;`;
var GROUP_REGEX = new RegExp(`(?:\\${ANSI_CSI}(?<code>\\d+)m|\\${ANSI_ESCAPE_LINK}(?<uri>.*)${ANSI_ESCAPE_BELL})`, "y");
var getClosingCode = (openingCode) => {
  if (openingCode >= 30 && openingCode <= 37)
    return 39;
  if (openingCode >= 90 && openingCode <= 97)
    return 39;
  if (openingCode >= 40 && openingCode <= 47)
    return 49;
  if (openingCode >= 100 && openingCode <= 107)
    return 49;
  if (openingCode === 1 || openingCode === 2)
    return 22;
  if (openingCode === 3)
    return 23;
  if (openingCode === 4)
    return 24;
  if (openingCode === 7)
    return 27;
  if (openingCode === 8)
    return 28;
  if (openingCode === 9)
    return 29;
  if (openingCode === 0)
    return 0;
  return void 0;
};
var wrapAnsiCode = (code) => `${ESC}${ANSI_CSI}${code}${ANSI_SGR_TERMINATOR}`;
var wrapAnsiHyperlink = (url) => `${ESC}${ANSI_ESCAPE_LINK}${url}${ANSI_ESCAPE_BELL}`;
var wrapWord = (rows, word, columns) => {
  const characters = word[Symbol.iterator]();
  let isInsideEscape = false;
  let isInsideLinkEscape = false;
  let lastRow = rows.at(-1);
  let visible = lastRow === void 0 ? 0 : dist_default2(lastRow);
  let currentCharacter = characters.next();
  let nextCharacter = characters.next();
  let rawCharacterIndex = 0;
  while (!currentCharacter.done) {
    const character = currentCharacter.value;
    const characterLength = dist_default2(character);
    if (visible + characterLength <= columns) {
      rows[rows.length - 1] += character;
    } else {
      rows.push(character);
      visible = 0;
    }
    if (character === ESC || character === CSI) {
      isInsideEscape = true;
      isInsideLinkEscape = word.startsWith(ANSI_ESCAPE_LINK, rawCharacterIndex + 1);
    }
    if (isInsideEscape) {
      if (isInsideLinkEscape) {
        if (character === ANSI_ESCAPE_BELL) {
          isInsideEscape = false;
          isInsideLinkEscape = false;
        }
      } else if (character === ANSI_SGR_TERMINATOR) {
        isInsideEscape = false;
      }
    } else {
      visible += characterLength;
      if (visible === columns && !nextCharacter.done) {
        rows.push("");
        visible = 0;
      }
    }
    currentCharacter = nextCharacter;
    nextCharacter = characters.next();
    rawCharacterIndex += character.length;
  }
  lastRow = rows.at(-1);
  if (!visible && lastRow !== void 0 && lastRow.length && rows.length > 1) {
    rows[rows.length - 2] += rows.pop();
  }
};
var stringVisibleTrimSpacesRight = (string) => {
  const words = string.split(" ");
  let last = words.length;
  while (last) {
    if (dist_default2(words[last - 1])) {
      break;
    }
    last--;
  }
  if (last === words.length) {
    return string;
  }
  return words.slice(0, last).join(" ") + words.slice(last).join("");
};
var exec = (string, columns, options = {}) => {
  if (options.trim !== false && string.trim() === "") {
    return "";
  }
  let returnValue = "";
  let escapeCode;
  let escapeUrl;
  const words = string.split(" ");
  let rows = [""];
  let rowLength = 0;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (options.trim !== false) {
      const row = rows.at(-1) ?? "";
      const trimmed = row.trimStart();
      if (row.length !== trimmed.length) {
        rows[rows.length - 1] = trimmed;
        rowLength = dist_default2(trimmed);
      }
    }
    if (index !== 0) {
      if (rowLength >= columns && (options.wordWrap === false || options.trim === false)) {
        rows.push("");
        rowLength = 0;
      }
      if (rowLength || options.trim === false) {
        rows[rows.length - 1] += " ";
        rowLength++;
      }
    }
    const wordLength = dist_default2(word);
    if (options.hard && wordLength > columns) {
      const remainingColumns = columns - rowLength;
      const breaksStartingThisLine = 1 + Math.floor((wordLength - remainingColumns - 1) / columns);
      const breaksStartingNextLine = Math.floor((wordLength - 1) / columns);
      if (breaksStartingNextLine < breaksStartingThisLine) {
        rows.push("");
      }
      wrapWord(rows, word, columns);
      rowLength = dist_default2(rows.at(-1) ?? "");
      continue;
    }
    if (rowLength + wordLength > columns && rowLength && wordLength) {
      if (options.wordWrap === false && rowLength < columns) {
        wrapWord(rows, word, columns);
        rowLength = dist_default2(rows.at(-1) ?? "");
        continue;
      }
      rows.push("");
      rowLength = 0;
    }
    if (rowLength + wordLength > columns && options.wordWrap === false) {
      wrapWord(rows, word, columns);
      rowLength = dist_default2(rows.at(-1) ?? "");
      continue;
    }
    rows[rows.length - 1] += word;
    rowLength += wordLength;
  }
  if (options.trim !== false) {
    rows = rows.map((row) => stringVisibleTrimSpacesRight(row));
  }
  const preString = rows.join("\n");
  let inSurrogate = false;
  for (let i2 = 0; i2 < preString.length; i2++) {
    const character = preString[i2];
    returnValue += character;
    if (!inSurrogate) {
      inSurrogate = character >= "\uD800" && character <= "\uDBFF";
      if (inSurrogate) {
        continue;
      }
    } else {
      inSurrogate = false;
    }
    if (character === ESC || character === CSI) {
      GROUP_REGEX.lastIndex = i2 + 1;
      const groupsResult = GROUP_REGEX.exec(preString);
      const groups = groupsResult?.groups;
      if (groups?.code !== void 0) {
        const code = Number.parseFloat(groups.code);
        escapeCode = code === END_CODE ? void 0 : code;
      } else if (groups?.uri !== void 0) {
        escapeUrl = groups.uri.length === 0 ? void 0 : groups.uri;
      }
    }
    if (preString[i2 + 1] === "\n") {
      if (escapeUrl) {
        returnValue += wrapAnsiHyperlink("");
      }
      const closingCode = escapeCode ? getClosingCode(escapeCode) : void 0;
      if (escapeCode && closingCode) {
        returnValue += wrapAnsiCode(closingCode);
      }
    } else if (character === "\n") {
      if (escapeCode && getClosingCode(escapeCode)) {
        returnValue += wrapAnsiCode(escapeCode);
      }
      if (escapeUrl) {
        returnValue += wrapAnsiHyperlink(escapeUrl);
      }
    }
  }
  return returnValue;
};
var CRLF_OR_LF = /\r?\n/;
function wrapAnsi(string, columns, options) {
  return String(string).normalize().split(CRLF_OR_LF).map((line) => exec(line, columns, options)).join("\n");
}

// node_modules/.pnpm/@clack+core@1.5.1/node_modules/@clack/core/dist/index.mjs
var import_sisteransi = __toESM(require_src(), 1);
function findCursor(s, o, l) {
  if (!l.some((r2) => !r2.disabled))
    return s;
  const t2 = s + o, n3 = Math.max(l.length - 1, 0), e = t2 < 0 ? n3 : t2 > n3 ? 0 : t2;
  return l[e]?.disabled ? findCursor(e, o < 0 ? -1 : 1, l) : e;
}
var a$1 = ["up", "down", "left", "right", "space", "enter", "cancel"];
var t = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var settings = {
  actions: new Set(a$1),
  aliases: /* @__PURE__ */ new Map([
    // vim support
    ["k", "up"],
    ["j", "down"],
    ["h", "left"],
    ["l", "right"],
    ["", "cancel"],
    // opinionated defaults!
    ["escape", "cancel"]
  ]),
  messages: {
    cancel: "Canceled",
    error: "Something went wrong"
  },
  withGuide: true,
  accessible: void 0,
  date: {
    monthNames: [...t],
    messages: {
      required: "Please enter a valid date",
      invalidMonth: "There are only 12 months in a year",
      invalidDay: (n3, e) => `There are only ${n3} days in ${e}`,
      afterMin: (n3) => `Date must be on or after ${n3.toISOString().slice(0, 10)}`,
      beforeMax: (n3) => `Date must be on or before ${n3.toISOString().slice(0, 10)}`
    }
  }
};
function isAccessible(n3) {
  if (n3 !== void 0) return n3;
  if (settings.accessible !== void 0) return settings.accessible;
  const e = process.env.ACCESSIBLE;
  return e !== void 0 && e !== "" && e !== "0" && e !== "false";
}
function isActionKey(n3, e) {
  if (typeof n3 == "string")
    return settings.aliases.get(n3) === e;
  for (const s of n3)
    if (s !== void 0 && isActionKey(s, e))
      return true;
  return false;
}
function diffLines(i2, s) {
  if (i2 === s) return;
  const e = i2.split(`
`), t2 = s.split(`
`), r2 = Math.max(e.length, t2.length), f = [];
  for (let n3 = 0; n3 < r2; n3++)
    e[n3] !== t2[n3] && f.push(n3);
  return {
    lines: f,
    numLinesBefore: e.length,
    numLinesAfter: t2.length,
    numLines: r2
  };
}
var R = globalThis.process.platform.startsWith("win");
var CANCEL_SYMBOL = /* @__PURE__ */ Symbol("clack:cancel");
function isCancel(e) {
  return e === CANCEL_SYMBOL;
}
function setRawMode(e, r2) {
  const o = e;
  o.isTTY && o.setRawMode(r2);
}
var getColumns = (e) => "columns" in e && typeof e.columns == "number" ? e.columns : 80;
var getRows = (e) => "rows" in e && typeof e.rows == "number" ? e.rows : 20;
function wrapTextWithPrefix(e, r2, o, n3 = o, s = o, t2) {
  const f = getColumns(e ?? stdout);
  return wrapAnsi(r2, f - o.length, {
    hard: true,
    trim: false
  }).split(`
`).map((c2, i2, m2) => {
    const d = t2 ? t2(c2, i2) : c2;
    return i2 === 0 ? `${n3}${d}` : i2 === m2.length - 1 ? `${s}${d}` : `${o}${d}`;
  }).join(`
`);
}
function runValidation(e, a2) {
  if ("~standard" in e) {
    const n3 = e["~standard"].validate(a2);
    return n3 instanceof Promise ? n3.then((r2) => r2.issues?.at(0)?.message) : n3.issues?.at(0)?.message;
  }
  return e(a2);
}
var y = class {
  input;
  output;
  _abortSignal;
  rl;
  opts;
  _render;
  _track = false;
  _prevFrame = "";
  _subscribers = /* @__PURE__ */ new Map();
  _cursor = 0;
  state = "initial";
  error = "";
  value;
  userInput = "";
  /**
   * Whether accessible (static, screen-reader friendly) output is enabled for
   * this prompt, resolved from the `accessible` option, the global setting,
   * and the `ACCESSIBLE` env var.
   */
  get accessible() {
    return isAccessible(this.opts.accessible);
  }
  constructor(t2, e = true) {
    const { input: i2 = stdin, output: s = stdout, render: r2, signal: n3, ...o } = t2;
    this.opts = o, this.onKeypress = this.onKeypress.bind(this), this.close = this.close.bind(this), this.render = this.render.bind(this), this._render = r2.bind(this), this._track = e, this._abortSignal = n3, this.input = i2, this.output = s;
  }
  /**
   * Unsubscribe all listeners
   */
  unsubscribe() {
    this._subscribers.clear();
  }
  /**
   * Set a subscriber with opts
   * @param event - The event name
   */
  setSubscriber(t2, e) {
    const i2 = this._subscribers.get(t2) ?? [];
    i2.push(e), this._subscribers.set(t2, i2);
  }
  /**
   * Subscribe to an event
   * @param event - The event name
   * @param cb - The callback
   */
  on(t2, e) {
    this.setSubscriber(t2, { cb: e });
  }
  /**
   * Subscribe to an event once
   * @param event - The event name
   * @param cb - The callback
   */
  once(t2, e) {
    this.setSubscriber(t2, { cb: e, once: true });
  }
  /**
   * Emit an event with data
   * @param event - The event name
   * @param data - The data to pass to the callback
   */
  emit(t2, ...e) {
    const i2 = this._subscribers.get(t2) ?? [], s = [];
    for (const r2 of i2)
      r2.cb(...e), r2.once && s.push(() => i2.splice(i2.indexOf(r2), 1));
    for (const r2 of s)
      r2();
  }
  prompt() {
    return new Promise((t2) => {
      if (this._abortSignal) {
        if (this._abortSignal.aborted)
          return this.state = "cancel", this.close(), t2(CANCEL_SYMBOL);
        this._abortSignal.addEventListener(
          "abort",
          () => {
            this.state = "cancel", this.close();
          },
          { once: true }
        );
      }
      this.rl = l__default.createInterface({
        input: this.input,
        tabSize: 2,
        prompt: "",
        escapeCodeTimeout: 50,
        terminal: true
      }), this.rl.prompt(), this.opts.initialUserInput !== void 0 && this._setUserInput(this.opts.initialUserInput, true), this.input.on("keypress", this.onKeypress), setRawMode(this.input, true), this.output.on("resize", this.render), this.render(), this.once("submit", () => {
        this.output.write(import_sisteransi.cursor.show), this.output.off("resize", this.render), setRawMode(this.input, false), t2(this.value);
      }), this.once("cancel", () => {
        this.output.write(import_sisteransi.cursor.show), this.output.off("resize", this.render), setRawMode(this.input, false), t2(CANCEL_SYMBOL);
      });
    });
  }
  _isActionKey(t2, e) {
    return t2 === "	";
  }
  _shouldSubmit(t2, e) {
    return true;
  }
  _setValue(t2) {
    this.value = t2, this.emit("value", this.value);
  }
  _setUserInput(t2, e) {
    this.userInput = t2 ?? "", this.emit("userInput", this.userInput), e && this._track && this.rl && (this.rl.write(this.userInput), this._cursor = this.rl.cursor);
  }
  _clearUserInput() {
    this.rl?.write(null, { ctrl: true, name: "u" }), this._setUserInput("");
  }
  async onKeypress(t2, e) {
    if (this.state !== "validating") {
      if (this._track && e.name !== "return" && (e.name && this._isActionKey(t2, e) && this.rl?.write(null, { ctrl: true, name: "h" }), this._cursor = this.rl?.cursor ?? 0, this._setUserInput(this.rl?.line)), this.state === "error" && (this.state = "active"), e?.name && (!this._track && settings.aliases.has(e.name) && this.emit("cursor", settings.aliases.get(e.name)), settings.actions.has(e.name) && this.emit("cursor", e.name)), t2 && (t2.toLowerCase() === "y" || t2.toLowerCase() === "n") && this.emit("confirm", t2.toLowerCase() === "y"), this.emit("key", t2, e), e?.name === "return" && this._shouldSubmit(t2, e)) {
        if (this.opts.validate) {
          const i2 = runValidation(this.opts.validate, this.value);
          let s;
          i2 instanceof Promise ? (this.state = "validating", this.render(), s = await i2) : s = i2, s && (this.error = s instanceof Error ? s.message : s, this.state = "error", this.rl?.write(this.userInput));
        }
        this.state !== "error" && (this.state = "submit");
      }
      isActionKey([t2, e?.name, e?.sequence], "cancel") && (this.state = "cancel"), (this.state === "submit" || this.state === "cancel") && this.emit("finalize"), this.render(), (this.state === "submit" || this.state === "cancel") && this.close();
    }
  }
  close() {
    this.input.unpipe(), this.input.removeListener("keypress", this.onKeypress), this.output.write(`
`), setRawMode(this.input, false), this.rl?.close(), this.rl = void 0, this.emit(`${this.state}`, this.value), this.unsubscribe();
  }
  restoreCursor() {
    const t2 = wrapAnsi(this._prevFrame, process.stdout.columns, { hard: true, trim: false }).split(`
`).length - 1;
    this.output.write(import_sisteransi.cursor.move(-999, t2 * -1));
  }
  render() {
    const t2 = wrapAnsi(this._render(this) ?? "", process.stdout.columns, {
      hard: true,
      trim: false
    });
    if (t2 !== this._prevFrame) {
      if (this.state === "initial")
        this.output.write(import_sisteransi.cursor.hide);
      else {
        const e = diffLines(this._prevFrame, t2), i2 = getRows(this.output);
        if (this.restoreCursor(), e) {
          const s = Math.max(0, e.numLinesAfter - i2), r2 = Math.max(0, e.numLinesBefore - i2);
          let n3 = e.lines.find((o) => o >= s);
          if (n3 === void 0) {
            this._prevFrame = t2;
            return;
          }
          if (e.lines.length === 1) {
            this.output.write(import_sisteransi.cursor.move(0, n3 - r2)), this.output.write(import_sisteransi.erase.lines(1));
            const o = t2.split(`
`);
            this.output.write(o[n3]), this._prevFrame = t2, this.output.write(import_sisteransi.cursor.move(0, o.length - n3 - 1));
            return;
          } else if (e.lines.length > 1) {
            if (s < r2)
              n3 = s;
            else {
              const h2 = n3 - r2;
              h2 > 0 && this.output.write(import_sisteransi.cursor.move(0, h2));
            }
            this.output.write(import_sisteransi.erase.down());
            const f = t2.split(`
`).slice(n3);
            this.output.write(f.join(`
`)), this._prevFrame = t2;
            return;
          }
        }
        this.output.write(import_sisteransi.erase.down());
      }
      this.output.write(t2), this.state === "initial" && (this.state = "active"), this._prevFrame = t2;
    }
  }
};
var r = class extends y {
  get cursor() {
    return this.value ? 0 : 1;
  }
  get _value() {
    return this.cursor === 0;
  }
  constructor(t2) {
    super(t2, false), this.value = !!t2.initialValue, this.on("userInput", () => {
      this.value = this._value;
    }), this.on("confirm", (i2) => {
      this.output.write(import_sisteransi.cursor.move(0, -1)), this.value = i2, this.state = "submit", this.close();
    }), this.on("cursor", () => {
      this.value = !this.value;
    });
  }
};
var a = class extends y {
  options;
  cursor = 0;
  get _value() {
    return this.options[this.cursor]?.value;
  }
  get _enabledOptions() {
    return this.options.filter((e) => e.disabled !== true);
  }
  toggleAll() {
    const e = this._enabledOptions, i2 = this.value !== void 0 && this.value.length === e.length;
    this.value = i2 ? [] : e.map((t2) => t2.value);
  }
  toggleInvert() {
    const e = this.value;
    if (!e)
      return;
    const i2 = this._enabledOptions.filter((t2) => !e.includes(t2.value));
    this.value = i2.map((t2) => t2.value);
  }
  toggleValue() {
    this.value === void 0 && (this.value = []);
    const e = this.value.includes(this._value);
    this.value = e ? this.value.filter((i2) => i2 !== this._value) : [...this.value, this._value];
  }
  constructor(e) {
    super(e, false), this.options = e.options, this.value = [...e.initialValues ?? []];
    const i2 = Math.max(
      this.options.findIndex(({ value: t2 }) => t2 === e.cursorAt),
      0
    );
    this.cursor = this.options[i2]?.disabled ? findCursor(i2, 1, this.options) : i2, this.on("key", (t2, l) => {
      l.name === "a" && this.toggleAll(), l.name === "i" && this.toggleInvert();
    }), this.on("cursor", (t2) => {
      switch (t2) {
        case "left":
        case "up":
          this.cursor = findCursor(this.cursor, -1, this.options);
          break;
        case "down":
        case "right":
          this.cursor = findCursor(this.cursor, 1, this.options);
          break;
        case "space":
          this.toggleValue();
          break;
      }
    });
  }
};
var n$1 = class n extends y {
  options;
  cursor = 0;
  get _selectedValue() {
    return this.options[this.cursor];
  }
  changeValue() {
    const e = this._selectedValue;
    this.value = e === void 0 ? void 0 : e.value;
  }
  constructor(e) {
    super(e, false), this.options = e.options;
    const o = this.options.findIndex(({ value: s }) => s === e.initialValue), t2 = o === -1 ? 0 : o;
    this.cursor = this.options[t2]?.disabled ? findCursor(t2, 1, this.options) : t2, this.changeValue(), this.on("cursor", (s) => {
      switch (s) {
        case "left":
        case "up":
          this.cursor = findCursor(this.cursor, -1, this.options);
          break;
        case "down":
        case "right":
          this.cursor = findCursor(this.cursor, 1, this.options);
          break;
      }
      this.changeValue();
    });
  }
};

// node_modules/.pnpm/@clack+prompts@1.8.1/node_modules/@clack/prompts/dist/index.mjs
import { styleText, stripVTControlCharacters } from "node:util";
import process$1 from "node:process";
var import_sisteransi2 = __toESM(require_src(), 1);
function isUnicodeSupported() {
  if (process$1.platform !== "win32") {
    return process$1.env.TERM !== "linux";
  }
  return Boolean(process$1.env.CI) || Boolean(process$1.env.WT_SESSION) || Boolean(process$1.env.TERMINUS_SUBLIME) || process$1.env.ConEmuTask === "{cmd::Cmder}" || process$1.env.TERM_PROGRAM === "Terminus-Sublime" || process$1.env.TERM_PROGRAM === "vscode" || process$1.env.TERM === "xterm-256color" || process$1.env.TERM === "alacritty" || process$1.env.TERMINAL_EMULATOR === "JetBrains-JediTerm";
}
var unicode = isUnicodeSupported();
var unicodeOr = (o, e) => unicode ? o : e;
var S_STEP_ACTIVE = unicodeOr("\u25C6", "*");
var S_STEP_CANCEL = unicodeOr("\u25A0", "x");
var S_STEP_ERROR = unicodeOr("\u25B2", "x");
var S_STEP_SUBMIT = unicodeOr("\u25C7", "o");
var S_BAR_START = unicodeOr("\u250C", "T");
var S_BAR = unicodeOr("\u2502", "|");
var S_BAR_END = unicodeOr("\u2514", "\u2014");
var S_BAR_START_RIGHT = unicodeOr("\u2510", "T");
var S_BAR_END_RIGHT = unicodeOr("\u2518", "\u2014");
var S_RADIO_ACTIVE = unicodeOr("\u25CF", ">");
var S_RADIO_INACTIVE = unicodeOr("\u25CB", " ");
var S_CHECKBOX_ACTIVE = unicodeOr("\u25FB", "[\u2022]");
var S_CHECKBOX_SELECTED = unicodeOr("\u25FC", "[+]");
var S_CHECKBOX_INACTIVE = unicodeOr("\u25FB", "[ ]");
var S_PASSWORD_MASK = unicodeOr("\u25AA", "\u2022");
var S_BAR_H = unicodeOr("\u2500", "-");
var S_CORNER_TOP_RIGHT = unicodeOr("\u256E", "+");
var S_CONNECT_LEFT = unicodeOr("\u251C", "+");
var S_CORNER_BOTTOM_RIGHT = unicodeOr("\u256F", "+");
var S_CORNER_BOTTOM_LEFT = unicodeOr("\u2570", "+");
var S_CORNER_TOP_LEFT = unicodeOr("\u256D", "+");
var S_INFO = unicodeOr("\u25CF", "\u2022");
var S_SUCCESS = unicodeOr("\u25C6", "*");
var S_WARN = unicodeOr("\u25B2", "!");
var S_ERROR = unicodeOr("\u25A0", "x");
var symbol = (o) => {
  switch (o) {
    case "initial":
    case "active":
      return styleText("cyan", S_STEP_ACTIVE);
    case "cancel":
      return styleText("red", S_STEP_CANCEL);
    case "error":
      return styleText("yellow", S_STEP_ERROR);
    case "submit":
      return styleText("green", S_STEP_SUBMIT);
    case "validating":
      return styleText("dim", S_STEP_ACTIVE);
  }
};
var symbolBar = (o) => {
  switch (o) {
    case "initial":
    case "active":
      return styleText("cyan", S_BAR);
    case "cancel":
      return styleText("red", S_BAR);
    case "error":
      return styleText("yellow", S_BAR);
    case "submit":
      return styleText("green", S_BAR);
  }
};
function formatInstructionFooter(o, e) {
  const r2 = [`${e ? `${styleText("cyan", S_BAR)}  ` : ""}${o.join(" \u2022 ")}`];
  return e && r2.push(styleText("cyan", S_BAR_END)), r2;
}
var I = (l, e, w, p, b, C = false) => {
  let r2 = e, O = 0;
  if (C)
    for (let i2 = p - 1; i2 >= w; i2--) {
      const m2 = l[i2];
      if (m2 && (r2 -= m2.length), O++, r2 <= b) break;
    }
  else
    for (let i2 = w; i2 < p; i2++) {
      const m2 = l[i2];
      if (m2 && (r2 -= m2.length), O++, r2 <= b) break;
    }
  return { lineCount: r2, removals: O };
};
var limitOptions = ({
  cursor: l,
  options: e,
  style: w,
  output: p = process.stdout,
  maxItems: b = Number.POSITIVE_INFINITY,
  columnPadding: C = 0,
  rowPadding: r2 = 4
}) => {
  const i2 = getColumns(p) - C, m2 = getRows(p), M = styleText("dim", "..."), v = Math.max(m2 - r2, 0), a2 = Math.max(Math.min(b, v), 5);
  let f = 0;
  l >= a2 - 3 && (f = Math.max(
    Math.min(l - a2 + 3, e.length - a2),
    0
  ));
  let d = a2 < e.length && f > 0, c2 = a2 < e.length && f + a2 < e.length;
  const W = Math.min(
    f + a2,
    e.length
  ), s = [];
  let g = 0;
  d && g++, c2 && g++;
  const T = f + (d ? 1 : 0), y2 = W - (c2 ? 1 : 0);
  for (let t2 = T; t2 < y2; t2++) {
    const n3 = e[t2], o = n3 ? w(n3, t2 === l) : "", h2 = wrapAnsi(o, i2, {
      hard: true,
      trim: false
    }).split(`
`);
    s.push(h2), g += h2.length;
  }
  if (g > v) {
    let t2 = 0, n3 = 0, o = g;
    const h2 = l - T;
    let u3 = v;
    const L = () => I(s, o, 0, h2, u3), E = () => I(
      s,
      o,
      h2 + 1,
      s.length,
      u3,
      true
    );
    d ? ({ lineCount: o, removals: t2 } = L(), o > u3 && (c2 || (u3 -= 1), { lineCount: o, removals: n3 } = E())) : (c2 || (u3 -= 1), { lineCount: o, removals: n3 } = E(), o > u3 && (u3 -= 1, { lineCount: o, removals: t2 } = L())), t2 > 0 && (d = true, s.splice(0, t2)), n3 > 0 && (c2 = true, s.splice(s.length - n3, n3));
  }
  const x = [];
  d && x.push(M);
  for (const t2 of s)
    for (const n3 of t2)
      x.push(n3);
  return c2 && x.push(M), x;
};
var confirm = (e) => {
  const a2 = e.active ?? "Yes", o = e.inactive ?? "No";
  return new r({
    active: a2,
    inactive: o,
    signal: e.signal,
    input: e.input,
    output: e.output,
    initialValue: e.initialValue ?? true,
    render() {
      const i2 = e.withGuide ?? settings.withGuide, u3 = `${symbol(this.state)}  `, l = i2 ? `${styleText("gray", S_BAR)}  ` : "", f = wrapTextWithPrefix(
        e.output,
        e.message,
        l,
        u3
      ), s = `${i2 ? `${styleText("gray", S_BAR)}
` : ""}${f}
`, c2 = this.value ? a2 : o;
      switch (this.state) {
        case "submit": {
          const r2 = i2 ? `${styleText("gray", S_BAR)}  ` : "";
          return `${s}${r2}${styleText("dim", c2)}`;
        }
        case "cancel": {
          const r2 = i2 ? `${styleText("gray", S_BAR)}  ` : "";
          return `${s}${r2}${styleText(["strikethrough", "dim"], c2)}${i2 ? `
${styleText("gray", S_BAR)}` : ""}`;
        }
        default: {
          const r2 = i2 ? `${styleText("cyan", S_BAR)}  ` : "", g = i2 ? styleText("cyan", S_BAR_END) : "";
          return `${s}${r2}${this.value ? `${styleText("green", S_RADIO_ACTIVE)} ${a2}` : `${styleText("dim", S_RADIO_INACTIVE)} ${styleText("dim", a2)}`}${e.vertical ? i2 ? `
${styleText("cyan", S_BAR)}  ` : `
` : ` ${styleText("dim", "/")} `}${this.value ? `${styleText("dim", S_RADIO_INACTIVE)} ${styleText("dim", o)}` : `${styleText("green", S_RADIO_ACTIVE)} ${o}`}
${g}
`;
        }
      }
    }
  }).prompt();
};
var MULTISELECT_INSTRUCTIONS = [
  `${styleText("dim", "\u2191/\u2193")} to navigate`,
  `${styleText("dim", "Space:")} select`,
  `${styleText("dim", "Enter:")} confirm`
];
var m = (i2, u3) => i2.split(`
`).map((d) => u3(d)).join(`
`);
var multiselect = (i2) => {
  const u3 = (t2, a2) => {
    const r2 = t2.label ?? String(t2.value);
    return a2 === "disabled" ? `${styleText("gray", S_CHECKBOX_INACTIVE)} ${m(r2, (o) => styleText(["strikethrough", "gray"], o))}${t2.hint ? ` ${styleText("dim", `(${t2.hint ?? "disabled"})`)}` : ""}` : a2 === "active" ? `${styleText("cyan", S_CHECKBOX_ACTIVE)} ${r2}${t2.hint ? ` ${styleText("dim", `(${t2.hint})`)}` : ""}` : a2 === "selected" ? `${styleText("green", S_CHECKBOX_SELECTED)} ${m(r2, (o) => styleText("dim", o))}${t2.hint ? ` ${styleText("dim", `(${t2.hint})`)}` : ""}` : a2 === "cancelled" ? `${m(r2, (o) => styleText(["strikethrough", "dim"], o))}` : a2 === "active-selected" ? `${styleText("green", S_CHECKBOX_SELECTED)} ${r2}${t2.hint ? ` ${styleText("dim", `(${t2.hint})`)}` : ""}` : a2 === "submitted" ? `${m(r2, (o) => styleText("dim", o))}` : `${styleText("dim", S_CHECKBOX_INACTIVE)} ${m(r2, (o) => styleText("dim", o))}`;
  }, d = i2.required ?? true, x = i2.showInstructions ?? true;
  return new a({
    options: i2.options,
    signal: i2.signal,
    input: i2.input,
    output: i2.output,
    initialValues: i2.initialValues,
    required: d,
    cursorAt: i2.cursorAt,
    validate(t2) {
      if (d && (t2 === void 0 || t2.length === 0))
        return `Please select at least one option.
${styleText(
          "reset",
          styleText(
            "dim",
            `Press ${styleText(["gray", "bgWhite", "inverse"], " space ")} to select, ${styleText(
              "gray",
              styleText("bgWhite", styleText("inverse", " enter "))
            )} to submit`
          )
        )}`;
    },
    render() {
      const t2 = i2.withGuide ?? settings.withGuide, a2 = wrapTextWithPrefix(
        i2.output,
        i2.message,
        t2 ? `${symbolBar(this.state)}  ` : "",
        `${symbol(this.state)}  `
      ), r2 = `${t2 ? `${styleText("gray", S_BAR)}
` : ""}${a2}
`, o = this.value ?? [], g = (n3, l) => {
        if (n3.disabled)
          return u3(n3, "disabled");
        const s = o.includes(n3.value);
        return l && s ? u3(n3, "active-selected") : s ? u3(n3, "selected") : u3(n3, l ? "active" : "inactive");
      };
      switch (this.state) {
        case "submit": {
          const n3 = this.options.filter(({ value: s }) => o.includes(s)).map((s) => u3(s, "submitted")).join(styleText("dim", ", ")) || styleText("dim", "none"), l = wrapTextWithPrefix(
            i2.output,
            n3,
            t2 ? `${styleText("gray", S_BAR)}  ` : ""
          );
          return `${r2}${l}`;
        }
        case "cancel": {
          const n3 = this.options.filter(({ value: s }) => o.includes(s)).map((s) => u3(s, "cancelled")).join(styleText("dim", ", "));
          if (n3.trim() === "")
            return `${r2}${styleText("gray", S_BAR)}`;
          const l = wrapTextWithPrefix(
            i2.output,
            n3,
            t2 ? `${styleText("gray", S_BAR)}  ` : ""
          );
          return `${r2}${l}${t2 ? `
${styleText("gray", S_BAR)}` : ""}`;
        }
        case "error": {
          const n3 = t2 ? `${styleText("yellow", S_BAR)}  ` : "", l = this.error.split(`
`).map(
            ($, v) => v === 0 ? `${t2 ? `${styleText("yellow", S_BAR_END)}  ` : ""}${styleText("yellow", $)}` : `   ${$}`
          ).join(`
`), s = r2.split(`
`).length, h2 = l.split(`
`).length + 1;
          return `${r2}${n3}${limitOptions({
            output: i2.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: i2.maxItems,
            columnPadding: n3.length,
            rowPadding: s + h2,
            style: g
          }).join(`
${n3}`)}
${l}
`;
        }
        default: {
          const n3 = t2 ? `${styleText("cyan", S_BAR)}  ` : "", l = r2.split(`
`).length, s = x ? formatInstructionFooter(MULTISELECT_INSTRUCTIONS, t2) : t2 ? [styleText("cyan", S_BAR_END)] : [], h2 = s.join(`
`), $ = s.length + 1;
          return `${r2}${n3}${limitOptions({
            output: i2.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: i2.maxItems,
            columnPadding: n3.length,
            rowPadding: l + $,
            style: g
          }).join(`
${n3}`)}
${h2}
`;
        }
      }
    }
  }).prompt();
};
var cancel = (o = "", t2) => {
  const i2 = t2?.output ?? process.stdout, e = t2?.withGuide ?? settings.withGuide ? `${styleText("gray", S_BAR_END)}  ` : "";
  i2.write(`${e}${styleText("red", o)}

`);
};
var intro = (o = "", t2) => {
  const i2 = t2?.output ?? process.stdout, e = t2?.withGuide ?? settings.withGuide ? `${styleText("gray", S_BAR_START)}  ` : "";
  i2.write(`${e}${o}
`);
};
var u2 = {
  light: unicodeOr("\u2500", "-"),
  heavy: unicodeOr("\u2501", "="),
  block: unicodeOr("\u2588", "#")
};
var SELECT_INSTRUCTIONS = [
  `${styleText("dim", "\u2191/\u2193")} to navigate`,
  `${styleText("dim", "Enter:")} confirm`
];
var c = (t2, o) => t2.includes(`
`) ? t2.split(`
`).map((d) => o(d)).join(`
`) : o(t2);
var select = (t2) => {
  const o = (n3, m2) => {
    if (n3 === void 0)
      return "";
    const s = n3.label ?? String(n3.value);
    switch (m2) {
      case "disabled":
        return `${styleText("gray", S_RADIO_INACTIVE)} ${c(s, (i2) => styleText("gray", i2))}${n3.hint ? ` ${styleText("dim", `(${n3.hint ?? "disabled"})`)}` : ""}`;
      case "selected":
        return `${c(s, (i2) => styleText("dim", i2))}`;
      case "active":
        return `${styleText("green", S_RADIO_ACTIVE)} ${s}${n3.hint ? ` ${styleText("dim", `(${n3.hint})`)}` : ""}`;
      case "cancelled":
        return `${c(s, (i2) => styleText(["strikethrough", "dim"], i2))}`;
      default:
        return `${styleText("dim", S_RADIO_INACTIVE)} ${c(s, (i2) => styleText("dim", i2))}`;
    }
  }, d = t2.showInstructions ?? true;
  return new n$1({
    options: t2.options,
    signal: t2.signal,
    input: t2.input,
    output: t2.output,
    initialValue: t2.initialValue,
    render() {
      const n3 = t2.withGuide ?? settings.withGuide, m2 = `${symbol(this.state)}  `, s = `${symbolBar(this.state)}  `, i2 = wrapTextWithPrefix(
        t2.output,
        t2.message,
        s,
        m2
      ), u3 = `${n3 ? `${styleText("gray", S_BAR)}
` : ""}${i2}
`;
      switch (this.state) {
        case "submit": {
          const r2 = n3 ? `${styleText("gray", S_BAR)}  ` : "", a2 = wrapTextWithPrefix(
            t2.output,
            o(this.options[this.cursor], "selected"),
            r2
          );
          return `${u3}${a2}`;
        }
        case "cancel": {
          const r2 = n3 ? `${styleText("gray", S_BAR)}  ` : "", a2 = wrapTextWithPrefix(
            t2.output,
            o(this.options[this.cursor], "cancelled"),
            r2
          );
          return `${u3}${a2}${n3 ? `
${styleText("gray", S_BAR)}` : ""}`;
        }
        default: {
          const r2 = n3 ? `${styleText("cyan", S_BAR)}  ` : "", a2 = u3.split(`
`).length, p = d ? formatInstructionFooter(SELECT_INSTRUCTIONS, n3) : n3 ? [styleText("cyan", S_BAR_END)] : [], f = p.join(`
`), b = p.length + 1;
          return `${u3}${r2}${limitOptions({
            output: t2.output,
            cursor: this.cursor,
            options: this.options,
            maxItems: t2.maxItems,
            columnPadding: r2.length,
            rowPadding: a2 + b,
            style: (g, x) => o(g, g.disabled ? "disabled" : x ? "active" : "inactive")
          }).join(`
${r2}`)}
${f}
`;
        }
      }
    }
  }).prompt();
};
var i = `${styleText("gray", S_BAR)}  `;

// tools/install.ts
var HOSTS = ["cursor", "claude", "codex", "opencode"];
var REPO_NAME = "sddkit";
function log(message) {
  console.error(message);
}
function die(message) {
  log(`ERROR: ${message}`);
  process.exit(1);
}
function onPath(...bins) {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  return bins.some((bin) => dirs.some((dir) => exts.some((ext) => fsSync.existsSync(path.join(dir, `${bin}${ext}`)))));
}
function detect() {
  return {
    cursor: onPath("cursor", "cursor-agent"),
    claude: onPath("claude"),
    codex: onPath("codex"),
    opencode: onPath("opencode")
  };
}
function hostOnPath(host) {
  return detect()[host];
}
function fromPosix(root, rel) {
  return path.join(root, ...rel.split("/"));
}
async function sha256File(filePath) {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}
function parseManifest(raw) {
  const map = /* @__PURE__ */ new Map();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const idx = line.indexOf("  ");
    if (idx < 0) continue;
    map.set(line.slice(idx + 2), line.slice(0, idx));
  }
  return map;
}
var STATE_BIN = "sddkit-state.mjs";
function findPackageRoot() {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i2 = 0; i2 < 8; i2++) {
    const manifest = path.join(dir, "manifest.txt");
    const distBin = path.join(dir, "dist", "bin", STATE_BIN);
    if (fsSync.existsSync(manifest) && fsSync.existsSync(distBin)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  die("could not find sddkit payload (manifest.txt + dist/) \u2014 run pnpm run build in the toolkit checkout");
}
function requirePayload(src) {
  const ok = fsSync.existsSync(path.join(src, "manifest.txt")) && fsSync.existsSync(path.join(src, "dist")) && fsSync.existsSync(path.join(src, "dist", "bin", STATE_BIN));
  if (!ok) {
    die(
      `${src} is missing dist/ + manifest.txt \u2014 clients copy a committed payload (run pnpm run build in the toolkit checkout)`
    );
  }
}
function normalizeTargets(raw) {
  const target = raw.replaceAll(" ", "");
  if (!target) die("INSTALL_TARGET is empty");
  if (target === "all") return target;
  for (const part of target.split(",")) {
    if (!HOSTS.includes(part)) {
      die(`invalid INSTALL_TARGET host: ${part} (use all or comma list: cursor,claude,codex,opencode)`);
    }
  }
  return target;
}
function wantsHost(installTarget, host) {
  if (installTarget === "all") return true;
  return `,${installTarget},`.includes(`,${host},`);
}
function abort() {
  cancel("Aborted");
  process.exit(1);
}
function shouldPrompt(scope, target) {
  if (process.env.CI) return false;
  if (scope || target) return false;
  return Boolean(process.stdout.isTTY);
}
async function promptInteractive(targetDir) {
  const detected = detect();
  intro("SDD harness installer");
  const scope = await select({
    message: "Install where?",
    options: [
      { value: "project", label: "This repository", hint: targetDir },
      { value: "global", label: "User home (all repos)", hint: process.env.HOME }
    ],
    initialValue: "project"
  });
  if (isCancel(scope)) abort();
  const detectedHosts = HOSTS.filter((host) => detected[host]);
  const targets = await multiselect({
    message: "Which hosts? Undetected ones can still be installed.",
    options: HOSTS.map((host) => ({
      value: host,
      label: host,
      hint: detected[host] ? "detected" : "not on PATH"
    })),
    initialValues: detectedHosts.length > 0 ? [...detectedHosts] : [...HOSTS],
    required: true
  });
  if (isCancel(targets)) abort();
  return { scope, target: targets.join(",") };
}
function parseArgs(argv) {
  let dryRun = false;
  let doctorOnly = false;
  let yes = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--doctor") doctorOnly = true;
    else if (arg === "--yes") yes = true;
  }
  return { dryRun, doctorOnly, yes };
}
function shouldConfirmApply(yes) {
  if (yes) return false;
  if (process.env.CI) return false;
  return Boolean(process.stdout.isTTY);
}
function isGitRepo(dir) {
  const r2 = spawnSync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return r2.status === 0 && r2.stdout.trim() === "true";
}
function ghStatus() {
  if (!onPath("gh")) return "missing";
  const r2 = spawnSync("gh", ["auth", "status"], { stdio: "ignore" });
  return r2.status === 0 ? "ok" : "logged-out";
}
function stateBinInUse(targetDir, home) {
  const project = path.join(targetDir, ".agents", "bin", STATE_BIN);
  const global = path.join(home, ".agents", "bin", STATE_BIN);
  if (fsSync.existsSync(project)) return project;
  if (fsSync.existsSync(global)) return global;
}
function resolveDests(scope, targetDir, home) {
  if (scope === "global") {
    return {
      agentsRoot: path.join(home, ".agents"),
      cursorAgents: path.join(home, ".cursor", "agents"),
      claudeAgents: path.join(home, ".claude", "agents"),
      claudeSkills: path.join(home, ".claude", "skills"),
      codexAgents: path.join(process.env.CODEX_HOME || path.join(home, ".codex"), "agents"),
      opencodeDest: path.join(home, ".config", "opencode", "agents"),
      opencodePrefix: "opencode/agents"
    };
  }
  return {
    agentsRoot: path.join(targetDir, ".agents"),
    cursorAgents: path.join(targetDir, ".cursor", "agents"),
    claudeAgents: path.join(targetDir, ".claude", "agents"),
    claudeSkills: path.join(targetDir, ".claude", "skills"),
    codexAgents: path.join(targetDir, ".codex", "agents"),
    opencodeDest: path.join(targetDir, ".opencode"),
    opencodePrefix: "opencode"
  };
}
function opLine(op) {
  let verb;
  switch (op.kind) {
    case "create":
      verb = "+ create   ";
      break;
    case "update":
      verb = "~ update   ";
      break;
    case "overwrite":
      verb = "~ overwrite";
      break;
    case "delete":
      verb = "- delete   ";
      break;
  }
  const warn = op.localEdit ? " (local edits will be lost)" : "";
  const extra = op.extra ? ` ${op.extra}` : "";
  return `  ${verb} ${op.label}${warn}${extra}`;
}
function countKinds(ops) {
  let created = 0;
  let updated = 0;
  let overwritten = 0;
  let deleted = 0;
  for (const op of ops) {
    if (op.kind === "create") created++;
    else if (op.kind === "update") updated++;
    else if (op.kind === "overwrite") overwritten++;
    else deleted++;
  }
  return { created, updated, overwritten, deleted };
}
function printTreePlan(plan) {
  for (const op of plan.ops) log(opLine(op));
  const { created, updated, overwritten, deleted } = countKinds(plan.ops);
  log(
    `  ${plan.prefix}: created ${created}, updated ${updated}, overwritten ${overwritten}, deleted ${deleted}, unchanged ${plan.skipped}.`
  );
}
async function applyOp(op) {
  if (op.kind === "delete") {
    await fs.rm(op.dest, { recursive: op.recursive === true, force: true });
    return;
  }
  await fs.mkdir(path.dirname(op.dest), { recursive: true });
  await fs.copyFile(op.src, op.dest);
  if (op.chmod !== void 0) await fs.chmod(op.dest, op.chmod);
}
async function pruneEmptyDirs(start, destRoot) {
  let dir = start;
  while (dir.startsWith(`${destRoot}${path.sep}`)) {
    try {
      await fs.rmdir(dir);
    } catch {
      return;
    }
    dir = path.dirname(dir);
  }
}
async function applyTree(plan) {
  for (const op of plan.ops) {
    await applyOp(op);
    if (op.kind === "delete") await pruneEmptyDirs(path.dirname(op.dest), plan.destRoot);
  }
  await fs.mkdir(plan.destRoot, { recursive: true });
  await fs.writeFile(path.join(plan.destRoot, ".harness-manifest"), plan.manifestBody);
}
async function confirmApply(ops) {
  const n3 = ops.length;
  const local = ops.filter((op) => op.localEdit).length;
  const noun = n3 === 1 ? "change" : "changes";
  const message = local > 0 ? `Apply ${n3} ${noun}? ${local} file${local === 1 ? " has" : "s have"} local edits that will be lost.` : `Apply ${n3} ${noun}?`;
  const confirmed = await confirm({ message, initialValue: true });
  if (isCancel(confirmed) || !confirmed) abort();
}
async function planTree(opts) {
  const { prefix, destRoot, stageDir, newManifest } = opts;
  const oldManifestPath = path.join(destRoot, ".harness-manifest");
  let oldManifest = /* @__PURE__ */ new Map();
  try {
    oldManifest = parseManifest(await fs.readFile(oldManifestPath, "utf8"));
  } catch {
    oldManifest = /* @__PURE__ */ new Map();
  }
  const ops = [];
  let skipped = 0;
  const prefixSlash = `${prefix}/`;
  for (const relPath of newManifest.keys()) {
    if (!relPath.startsWith(prefixSlash)) continue;
    const destRel = relPath.slice(prefixSlash.length);
    const dest = fromPosix(destRoot, destRel);
    const wantHash = newManifest.get(relPath) ?? "";
    const src = fromPosix(stageDir, relPath);
    const label = `${prefix}/${destRel}`;
    if (!fsSync.existsSync(dest) || !fsSync.statSync(dest).isFile()) {
      ops.push({ kind: "create", label, dest, src, localEdit: false });
      continue;
    }
    const haveHash = await sha256File(dest);
    if (haveHash === wantHash) {
      skipped++;
      continue;
    }
    const prevHash = oldManifest.get(destRel);
    if (prevHash && haveHash !== prevHash) {
      ops.push({ kind: "overwrite", label, dest, src, localEdit: true });
    } else {
      ops.push({ kind: "update", label, dest, src, localEdit: false });
    }
  }
  for (const destRel of oldManifest.keys()) {
    if (newManifest.has(`${prefix}/${destRel}`)) continue;
    const dest = fromPosix(destRoot, destRel);
    if (!fsSync.existsSync(dest) || !fsSync.statSync(dest).isFile()) continue;
    if (destRel === ".harness-manifest") continue;
    const haveHash = await sha256File(dest);
    const prevHash = oldManifest.get(destRel);
    const localEdit = Boolean(prevHash && haveHash !== prevHash);
    ops.push({
      kind: "delete",
      label: `${prefix}/${destRel}`,
      dest,
      localEdit
    });
  }
  const lines = [];
  for (const relPath of newManifest.keys()) {
    if (!relPath.startsWith(prefixSlash)) continue;
    const destRel = relPath.slice(prefixSlash.length);
    lines.push(`${newManifest.get(relPath)}  ${destRel}`);
  }
  lines.sort((a2, b) => (a2.split("  ")[1] ?? "").localeCompare(b.split("  ")[1] ?? ""));
  return {
    prefix,
    destRoot,
    ops,
    skipped,
    manifestBody: lines.length > 0 ? `${lines.join("\n")}
` : ""
  };
}
async function planBin(opts) {
  const destDir = opts.scope === "global" ? path.join(opts.home, ".agents", "bin") : path.join(opts.targetDir, ".agents", "bin");
  const dest = path.join(destDir, STATE_BIN);
  const src = path.join(opts.stageDir, "bin", STATE_BIN);
  const wantHash = opts.newManifest.get(`bin/${STATE_BIN}`);
  if (!wantHash) die(`manifest missing bin/${STATE_BIN}`);
  const ops = [];
  const label = `.agents/bin/${STATE_BIN}`;
  if (!(fsSync.existsSync(dest) && await sha256File(dest) === wantHash)) {
    if (fsSync.existsSync(dest)) {
      ops.push({ kind: "update", label, dest, src, chmod: 493, localEdit: false });
    } else {
      ops.push({ kind: "create", label, dest, src, chmod: 493, localEdit: false });
    }
  }
  const leftovers = [path.join(destDir, "sddkit-state"), path.join(destDir, "sddkit-state.js")];
  if (opts.scope === "project") {
    leftovers.push(path.join(opts.targetDir, "bin", "sddkit-state"), path.join(opts.targetDir, "bin", "sdd-state"));
  }
  for (const leftover of leftovers) {
    if (!fsSync.existsSync(leftover)) continue;
    const rel = leftover.startsWith(`${opts.targetDir}${path.sep}`) ? leftover.slice(opts.targetDir.length + 1) : leftover;
    ops.push({
      kind: "delete",
      label: rel,
      dest: leftover,
      localEdit: false,
      extra: `(moved to .agents/bin/${STATE_BIN})`
    });
  }
  return ops;
}
function planLegacyCursorSkills(scope, targetDir, home) {
  const dest = scope === "global" ? path.join(home, ".cursor", "skills") : path.join(targetDir, ".cursor", "skills");
  const ops = [];
  if (!fsSync.existsSync(dest)) return ops;
  for (const name of ["sddkit", "sddkit-plan", "setup-docs"]) {
    const pth = path.join(dest, name);
    if (!fsSync.existsSync(pth)) continue;
    ops.push({
      kind: "delete",
      label: `.cursor/skills/${name}`,
      dest: pth,
      recursive: true,
      localEdit: false,
      extra: "(moved to .agents/skills/)"
    });
  }
  return ops;
}
function doctor(targetDir, home) {
  log("");
  log("Doctor:");
  for (const host of HOSTS) {
    if (hostOnPath(host)) log(`  [ok]   ${host} CLI is on PATH`);
    else log(`  [warn] ${host} CLI not detected (install still allowed)`);
  }
  if (isGitRepo(targetDir)) log(`  [ok]   ${targetDir} is a git repository`);
  else log(`  [warn] ${targetDir} is not a git repository`);
  if (fsSync.existsSync(path.join(targetDir, "AGENTS.md"))) log("  [ok]   AGENTS.md present");
  else log("  [warn] AGENTS.md missing \u2014 run /sddkit-setup-docs first");
  log("  paths:");
  log(`    skills          ${targetDir}/.agents/skills/  or  ${home}/.agents/skills/`);
  log(`    sddkit-state    ${targetDir}/.agents/bin/  or  ${home}/.agents/bin/`);
  log(`    cursor agents   ${targetDir}/.cursor/agents/  or  ${home}/.cursor/agents/`);
  log(`    claude agents   ${targetDir}/.claude/agents/  or  ${home}/.claude/agents/`);
  log(`    claude skills   ${targetDir}/.claude/skills/  or  ${home}/.claude/skills/`);
  log(`    codex agents    ${targetDir}/.codex/agents/  or  \${CODEX_HOME:-${home}/.codex}/agents/`);
  log(`    opencode        ${targetDir}/.opencode/  or  ${home}/.config/opencode/agents/ (no jsonc)`);
  const stateBin = stateBinInUse(targetDir, home);
  if (stateBin) log(`  [ok]   sddkit-state: ${stateBin}`);
  else log("  [warn] sddkit-state missing \u2014 re-run the installer");
  if (onPath("node")) log("  [ok]   node is on PATH (needed to run sddkit-state)");
  else log("  [warn] node not found \u2014 install Node.js 20+ to run sddkit-state");
  const gh = ghStatus();
  if (gh === "ok") log("  [ok]   gh installed and authenticated");
  else if (gh === "logged-out") log("  [warn] gh installed but not logged in \u2014 run 'gh auth login'");
  else log("  [warn] gh not found \u2014 required by the pipeline: brew install gh && gh auth login");
  log("");
}
function suggestNextSteps() {
  log("Next steps:");
  log("  1. /sddkit-setup-docs \u2014 scaffold AGENTS.md + docs/ARCHITECTURE.md + CONSTITUTION");
  if (!onPath("gh")) {
    log("  2. Install gh (required by the pipeline):");
    log("       brew install gh && gh auth login");
    log("       # or: https://cli.github.com/");
  } else {
    log("  2. gh is on PATH \u2014 run 'gh auth login' if you aren't logged in");
  }
  log("");
  log("Optional: sddkit-epic \u2014 Product Owner planner (/sddkit-epic skill, or the");
  log("  OpenCode sddkit-epic agent) turns a raw idea into a feature roadmap at");
  log("  docs/product/<slug>/roadmap.md. Run each feature through sddkit one at a");
  log("  time \u2014 it hands you the next feature's invocation when one is done.");
  log("");
  log("Optional: rtk (filters noisy bash output for agents)");
  log("  brew install rtk   # or see https://github.com/rtk-ai/rtk");
  log("  rtk init --opencode   # OpenCode");
  log("  # Quick start: exclude git diff/show from rewriting so the code reviewers");
  log("  # and sddkit-docs-writer see full diffs \u2014 in ~/.config/rtk/config.toml:");
  log("  #   [hooks]");
  log('  #   exclude_commands = ["git diff", "git show"]');
  log("");
}
async function stagePayload(payloadDir) {
  const raw = await fs.readFile(path.join(payloadDir, "manifest.txt"), "utf8");
  if (!raw.trim()) die("manifest.txt is empty");
  const manifest = parseManifest(raw);
  const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), "sddkit-install-"));
  let fileCount = 0;
  try {
    for (const [relPath, expectedHash] of manifest) {
      const src = fromPosix(path.join(payloadDir, "dist"), relPath);
      if (!fsSync.existsSync(src)) {
        await fs.rm(stageDir, { recursive: true, force: true });
        die(`missing ${path.join(payloadDir, "dist", relPath)}`);
      }
      const dest = fromPosix(stageDir, relPath);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
      const actualHash = await sha256File(dest);
      if (actualHash !== expectedHash) {
        await fs.rm(stageDir, { recursive: true, force: true });
        die(`checksum mismatch for ${relPath} \u2014 aborting, nothing installed`);
      }
      fileCount++;
    }
  } catch (err) {
    await fs.rm(stageDir, { recursive: true, force: true });
    throw err;
  }
  return { stageDir, manifest, fileCount };
}
async function main() {
  const { dryRun, doctorOnly, yes } = parseArgs(process.argv.slice(2));
  const targetDir = path.resolve(process.env.TARGET_DIR || process.cwd());
  const home = process.env.HOME || os.homedir();
  if (doctorOnly) {
    doctor(targetDir, home);
    return;
  }
  if (!fsSync.existsSync(targetDir) || !fsSync.statSync(targetDir).isDirectory()) {
    die(`target directory does not exist: ${targetDir}`);
  }
  let scopeRaw = process.env.INSTALL_SCOPE ?? "";
  let targetRaw = process.env.INSTALL_TARGET ?? "";
  if (shouldPrompt(scopeRaw, targetRaw)) {
    const picked = await promptInteractive(targetDir);
    scopeRaw = picked.scope;
    targetRaw = picked.target;
  } else {
    if (!scopeRaw) scopeRaw = "project";
    if (!targetRaw) targetRaw = "all";
  }
  if (scopeRaw !== "project" && scopeRaw !== "global") {
    die(`invalid INSTALL_SCOPE: ${scopeRaw} (use project or global)`);
  }
  const scope = scopeRaw;
  const installTarget = normalizeTargets(targetRaw);
  const localSource = process.env.LOCAL_SOURCE || "";
  let payloadDir;
  if (localSource) {
    if (!fsSync.existsSync(localSource) || !fsSync.statSync(localSource).isDirectory()) {
      die(`LOCAL_SOURCE does not exist: ${localSource}`);
    }
    requirePayload(localSource);
    payloadDir = localSource;
    log(`Installing from local source: ${localSource} (scope=${scope} target=${installTarget})`);
  } else {
    payloadDir = findPackageRoot();
    requirePayload(payloadDir);
    log(`Installing ${REPO_NAME} (scope=${scope} target=${installTarget})...`);
  }
  const { stageDir, manifest, fileCount } = await stagePayload(payloadDir);
  try {
    log(`Verified ${fileCount} files against manifest.txt`);
    const dests = resolveDests(scope, targetDir, home);
    const trees = [
      await planTree({
        prefix: "agents",
        destRoot: dests.agentsRoot,
        stageDir,
        newManifest: manifest
      })
    ];
    if (wantsHost(installTarget, "cursor")) {
      trees.push(
        await planTree({
          prefix: "cursor/agents",
          destRoot: dests.cursorAgents,
          stageDir,
          newManifest: manifest
        })
      );
    }
    if (wantsHost(installTarget, "claude")) {
      trees.push(
        await planTree({
          prefix: "claude/agents",
          destRoot: dests.claudeAgents,
          stageDir,
          newManifest: manifest
        })
      );
      trees.push(
        await planTree({
          prefix: "agents/skills",
          destRoot: dests.claudeSkills,
          stageDir,
          newManifest: manifest
        })
      );
    }
    if (wantsHost(installTarget, "codex")) {
      trees.push(
        await planTree({
          prefix: "codex/agents",
          destRoot: dests.codexAgents,
          stageDir,
          newManifest: manifest
        })
      );
    }
    if (wantsHost(installTarget, "opencode")) {
      trees.push(
        await planTree({
          prefix: dests.opencodePrefix,
          destRoot: dests.opencodeDest,
          stageDir,
          newManifest: manifest
        })
      );
    }
    const extraOps = [
      ...await planBin({ scope, targetDir, home, stageDir, newManifest: manifest }),
      ...planLegacyCursorSkills(scope, targetDir, home)
    ];
    for (const tree of trees) printTreePlan(tree);
    for (const op of extraOps) log(opLine(op));
    const allFileOps = [...trees.flatMap((tree) => tree.ops), ...extraOps];
    if (dryRun) {
      log("");
      log(`Dry run complete (scope=${scope} target=${installTarget}).`);
      return;
    }
    if (allFileOps.length > 0 && shouldConfirmApply(yes)) {
      await confirmApply(allFileOps);
    }
    for (const tree of trees) await applyTree(tree);
    for (const op of extraOps) await applyOp(op);
    log("");
    log(
      "Done. Invoke .agents/bin/sddkit-state.mjs (or $HOME/.agents/bin/sddkit-state.mjs) so the conductor can checkpoint state."
    );
    log("");
    suggestNextSteps();
    doctor(targetDir, home);
  } finally {
    await fs.rm(stageDir, { recursive: true, force: true });
  }
}
await main();
