"use strict";

const { DOMParser, XMLSerializer } = require("xmldom");
const { throwXmlTagNotFound } = require("./errors");

function parser(tag) {
	return {
		["get"](scope) {
			if (tag === ".") {
				return scope;
			}
			return scope[tag];
		},
	};
}

function endsWith(str, suffix) {
	return str.indexOf(suffix, str.length - suffix.length) !== -1;
}
function startsWith(str, prefix) {
	return str.substring(0, prefix.length) === prefix;
}

function unique(arr) {
	const hash = {},
		result = [];
	for (let i = 0, l = arr.length; i < l; ++i) {
		if (!hash.hasOwnProperty(arr[i])) {
			hash[arr[i]] = true;
			result.push(arr[i]);
		}
	}
	return result;
}

function chunkBy(parsed, f) {
	return parsed
		.reduce(
			function(chunks, p) {
				const currentChunk = last(chunks);
				if (currentChunk.length === 0) {
					currentChunk.push(p);
					return chunks;
				}
				const res = f(p);
				if (res === "start") {
					chunks.push([p]);
				} else if (res === "end") {
					currentChunk.push(p);
					chunks.push([]);
				} else {
					currentChunk.push(p);
				}
				return chunks;
			},
			[[]]
		)
		.filter(function(p) {
			return p.length > 0;
		});
}

function last(a) {
	return a[a.length - 1];
}

const defaults = {
	nullGetter(part) {
		if (!part.module) {
			return "undefined";
		}
		if (part.module === "rawxml") {
			return "";
		}
		return "";
	},
	xmlFileNames: [],
	parser,
	linebreaks: false,
	delimiters: {
		start: "{",
		end: "}",
	},
};

function mergeObjects() {
	const resObj = {};
	let obj, keys;
	for (let i = 0; i < arguments.length; i += 1) {
		obj = arguments[i];
		keys = Object.keys(obj);
		for (let j = 0; j < keys.length; j += 1) {
			resObj[keys[j]] = obj[keys[j]];
		}
	}
	return resObj;
}

function xml2str(xmlNode) {
	const a = new XMLSerializer();
	return a.serializeToString(xmlNode).replace(/xmlns(:[a-z0-9]+)?="" ?/g, "");
}

function str2xml(str) {
	const parser = new DOMParser();
	return parser.parseFromString(str, "text/xml");
}

const charMap = {
	"&": "&amp;",
	"'": "&apos;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
};

const regexStripRegexp = /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g;
function escapeRegExp(str) {
	return str.replace(regexStripRegexp, "\\$&");
}

const charMapRegexes = Object.keys(charMap).map(function(endChar) {
	const startChar = charMap[endChar];
	return {
		rstart: new RegExp(escapeRegExp(startChar), "g"),
		rend: new RegExp(escapeRegExp(endChar), "g"),
		start: startChar,
		end: endChar,
	};
});

function wordToUtf8(string) {
	let r;
	for (let i = 0, l = charMapRegexes.length; i < l; i++) {
		r = charMapRegexes[i];
		string = string.replace(r.rstart, r.end);
	}
	return string;
}

function utf8ToWord(string) {
	if (typeof string !== "string") {
		string = string.toString();
	}
	let r;
	for (let i = 0, l = charMapRegexes.length; i < l; i++) {
		r = charMapRegexes[i];
		string = string.replace(r.rend, r.start);
	}
	return string;
}

// This function is written with for loops for performance
function concatArrays(arrays) {
	const result = [];
	for (let i = 0; i < arrays.length; i++) {
		const array = arrays[i];
		for (let j = 0, len = array.length; j < len; j++) {
			result.push(array[j]);
		}
	}
	return result;
}

const spaceRegexp = new RegExp(String.fromCharCode(160), "g");
function convertSpaces(s) {
	return s.replace(spaceRegexp, " ");
}
function pregMatchAll(regex, content) {
	/* regex is a string, content is the content. It returns an array of all matches with their offset, for example:
		 regex=la
		 content=lolalolilala
returns: [{array: {0: 'la'},offset: 2},{array: {0: 'la'},offset: 8},{array: {0: 'la'} ,offset: 10}]
*/
	const matchArray = [];
	let match;
	while ((match = regex.exec(content)) != null) {
		matchArray.push({ array: match, offset: match.index });
	}
	return matchArray;
}

function getRight(parsed, element, index) {
	const val = getRightOrNull(parsed, element, index);
	if (val !== null) {
		return val;
	}
	throwXmlTagNotFound({ position: "right", element, parsed, index });
}

function getRightOrNull(parsed, element, index) {
	for (let i = index, l = parsed.length; i < l; i++) {
		const part = parsed[i];
		if (part.value === "</" + element + ">") {
			return i;
		}
	}
	return null;
}

function getLeft(parsed, element, index) {
	const val = getLeftOrNull(parsed, element, index);
	if (val !== null) {
		return val;
	}
	throwXmlTagNotFound({ position: "left", element, parsed, index });
}

function getLeftOrNull(parsed, element, index) {
	for (let i = index; i >= 0; i--) {
		const part = parsed[i];
		if (
			part.value.indexOf("<" + element) === 0 &&
			[">", " "].indexOf(part.value[element.length + 1]) !== -1
		) {
			return i;
		}
	}
	return null;
}

function isTagStart(tagType, { type, tag, position }) {
	return type === "tag" && tag === tagType && position === "start";
}
function isTagEnd(tagType, { type, tag, position }) {
	return type === "tag" && tag === tagType && position === "end";
}
function isParagraphStart(options) {
	return isTagStart("w:p", options) || isTagStart("a:p", options);
}
function isParagraphEnd(options) {
	return isTagEnd("w:p", options) || isTagEnd("a:p", options);
}
function isTextStart(part) {
	return part.type === "tag" && part.position === "start" && part.text;
}
function isTextEnd(part) {
	return part.type === "tag" && part.position === "end" && part.text;
}

function isContent(p) {
	return (
		p.type === "placeholder" ||
		(p.type === "content" && p.position === "insidetag")
	);
}

const corruptCharacters = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
// 00    NUL '\0' (null character)
// 01    SOH (start of heading)
// 02    STX (start of text)
// 03    ETX (end of text)
// 04    EOT (end of transmission)
// 05    ENQ (enquiry)
// 06    ACK (acknowledge)
// 07    BEL '\a' (bell)
// 08    BS  '\b' (backspace)
// 0B    VT  '\v' (vertical tab)
// 0C    FF  '\f' (form feed)
// 0E    SO  (shift out)
// 0F    SI  (shift in)
// 10    DLE (data link escape)
// 11    DC1 (device control 1)
// 12    DC2 (device control 2)
// 13    DC3 (device control 3)
// 14    DC4 (device control 4)
// 15    NAK (negative ack.)
// 16    SYN (synchronous idle)
// 17    ETB (end of trans. blk)
// 18    CAN (cancel)
// 19    EM  (end of medium)
// 1A    SUB (substitute)
// 1B    ESC (escape)
// 1C    FS  (file separator)
// 1D    GS  (group separator)
// 1E    RS  (record separator)
// 1F    US  (unit separator)
function hasCorruptCharacters(string) {
	return corruptCharacters.test(string);
}

module.exports = {
	endsWith,
	startsWith,
	isContent,
	isParagraphStart,
	isParagraphEnd,
	isTagStart,
	isTagEnd,
	isTextStart,
	isTextEnd,
	unique,
	chunkBy,
	last,
	mergeObjects,
	xml2str,
	str2xml,
	getRightOrNull,
	getRight,
	getLeftOrNull,
	getLeft,
	pregMatchAll,
	convertSpaces,
	escapeRegExp,
	charMapRegexes,
	hasCorruptCharacters,
	defaults,
	wordToUtf8,
	utf8ToWord,
	concatArrays,
	charMap,
};
