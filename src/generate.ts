#!/usr/bin/env node
import { XMLParser } from "fast-xml-parser";
import * as fs from "fs";
import * as path from "path";

type MavlinkField = {
  name: string;
  type: string;
  enum?: string;
  description?: string;
  extension?: boolean;
};

type MavlinkMessage = {
  id: string;
  name: string;
  field: MavlinkField | MavlinkField[];
  description?: string;
};

type MavlinkEntry = {
  name: string;
  value: string;
  description?: string;
};

type MavlinkEnum = {
  name: string;
  entry: MavlinkEntry | MavlinkEntry[];
  bitmask?: string;
  description?: string;
};

type MavlinkXml = {
  mavlink: {
    messages?: {
      message: MavlinkMessage | MavlinkMessage[];
    };
    enums?: {
      enum: MavlinkEnum | MavlinkEnum[];
    };
  };
};

const toPascalCase = (text: string) => {
  const result = text
    .split("_")
    .map(word => {
      if (word === word.toUpperCase() && word.length > 1)
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join("");
  return /^\d/.test(result) ? "V" + result : result;
};

const ReservedWords = new Set([
  "arguments",
  "default",
  "function",
  "class",
  "interface",
  "view",
  "offset",
  "buffer",
  "message",
  "payload",
]);

const toCamelCase = (text: string) => {
  const pascal = toPascalCase(text);
  const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
  return ReservedWords.has(camel) ? `${camel}_` : camel;
};

const safeKey = (key: string) => {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) && !ReservedWords.has(key))
    return key;

  return `"${key}"`;
};

const mapType = (mavlinkType: string) => {
  const type = mavlinkType.trim();
  if (type.startsWith("char[")) return "string";
  if (type === "char") return "string";

  const arrayLength = getArrayLength(type);
  if (arrayLength > 0) {
    const base = type.split("[")[0] ?? "";
    if (base === "uint8_t") return "Uint8Array";
    const baseTsType = /^u?int64_t/.test(base) ? "bigint" : "number";
    return `readonly [${Array(arrayLength).fill(baseTsType).join(", ")}]`;
  }

  if (/^u?int64_t/.test(type)) return "bigint";
  return "number";
};

const getTypeSize = (mavlinkType: string) => {
  const type = mavlinkType.trim();
  if (/^(u?int64_t|double)/.test(type)) return 8;
  if (/^(u?int32_t|float)/.test(type)) return 4;
  if (/^u?int16_t/.test(type)) return 2;
  return 1;
};

const getMethods = (type: string) => {
  if (type.startsWith("uint8_t"))
    return { read: "getUint8", write: "setUint8" };
  if (type.startsWith("int8_t")) return { read: "getInt8", write: "setInt8" };
  if (type.startsWith("uint16_t"))
    return { read: "getUint16", write: "setUint16" };
  if (type.startsWith("int16_t"))
    return { read: "getInt16", write: "setInt16" };
  if (type.startsWith("uint32_t"))
    return { read: "getUint32", write: "setUint32" };
  if (type.startsWith("int32_t"))
    return { read: "getInt32", write: "setInt32" };
  if (type.startsWith("uint64_t"))
    return { read: "getBigUint64", write: "setBigUint64" };
  if (type.startsWith("int64_t"))
    return { read: "getBigInt64", write: "setBigInt64" };
  if (type.startsWith("float"))
    return { read: "getFloat32", write: "setFloat32" };
  if (type.startsWith("double"))
    return { read: "getFloat64", write: "setFloat64" };
  return { read: "getUint8", write: "setUint8" };
};

const getArrayLength = (mavlinkType: string) => {
  const match = mavlinkType.match(/\[(\d+)\]/);
  return match?.[1] ? parseInt(match[1]) : 0;
};

const crc8 = (seed: number, byte: number): number => {
  let temporary = byte ^ (seed & 0xff);
  temporary ^= (temporary << 4) & 0xff;
  return (
    ((seed >> 8) ^ (temporary << 8) ^ (temporary << 3) ^ (temporary >> 4)) &
    0xffff
  );
};

const getSortedFields = (message: MavlinkMessage) => {
  const allFields = (
    Array.isArray(message.field) ? message.field : [message.field]
  ).filter(Boolean);

  const baseFields = allFields.filter(f => !f.extension);
  const extensionFields = allFields.filter(f => f.extension);

  baseFields.sort((a, b) => {
    const sizeA = getTypeSize(a.type);
    const sizeB = getTypeSize(b.type);
    if (sizeA !== sizeB) return sizeB - sizeA;
    return allFields.indexOf(a) - allFields.indexOf(b);
  });

  return [...baseFields, ...extensionFields];
};

const calculateCrcExtra = (message: MavlinkMessage): number => {
  const sortedFields = getSortedFields(message).filter(f => !f.extension);

  let seed = message.name + " ";
  for (const field of sortedFields) {
    let type = field.type.trim();
    if (type === "uint8_t_mavlink_version") type = "uint8_t";
    const [typeName] = type.split("[");
    seed += typeName + " " + field.name + " ";
    const arrayLength = getArrayLength(field.type);
    if (arrayLength > 0) seed += String.fromCharCode(arrayLength);
  }

  let crcValue = 0xffff;
  for (let i = 0; i < seed.length; i++)
    crcValue = crc8(crcValue, seed.charCodeAt(i));

  return (crcValue & 0xff) ^ (crcValue >> 8);
};

const getExtensionFields = (xml: string, messageName: string): Set<string> => {
  const messageRegex = new RegExp(
    `<message[^>]*name="${messageName}"[^>]*>([\\s\\S]*?)<\\/message>`,
    "g",
  );
  const match = messageRegex.exec(xml);
  if (!match) return new Set();
  const content = match[1] ?? "";
  const extensionsSplit = content.split("<extensions/>");
  if (extensionsSplit.length < 2) return new Set();
  const extensionsContent = extensionsSplit[1] ?? "";
  const fieldNames = new Set<string>();
  const fieldNameRegex = /<field[^>]*name="([^"]+)"/g;
  let fieldMatch;
  while ((fieldMatch = fieldNameRegex.exec(extensionsContent)) !== null)
    if (fieldMatch[1]) fieldNames.add(fieldMatch[1]);

  return fieldNames;
};

export const generateMavlinkApi = async (urls: string[]): Promise<string> => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  });
  const messages: MavlinkMessage[] = [];
  const enumsMap = new Map<string, MavlinkEnum>();
  const seenMessages = new Set<string>();
  const bitmasks = new Set<string>();

  for (const url of urls) {
    console.log("Fetching", url);
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch ${url}: ${response.statusText}`);
      continue;
    }
    const xmlContent = await response.text();
    console.log("Parsing", url);
    const jsonContent = parser.parse(xmlContent) as MavlinkXml;
    const mavlinkEnums = jsonContent.mavlink.enums?.enum;
    if (mavlinkEnums) {
      const enumList = Array.isArray(mavlinkEnums)
        ? mavlinkEnums
        : [mavlinkEnums];
      for (const enumDef of enumList) {
        const existing = enumsMap.get(enumDef.name);
        const entries = Array.isArray(enumDef.entry)
          ? enumDef.entry
          : [enumDef.entry];
        if (existing) {
          const existingEntries = Array.isArray(existing.entry)
            ? existing.entry
            : [existing.entry];
          for (const entry of entries)
            if (!existingEntries.some(e => e.name === entry.name))
              existingEntries.push(entry);

          existing.entry = existingEntries;
        } else enumsMap.set(enumDef.name, { ...enumDef, entry: [...entries] });

        if (enumDef.bitmask === "true") bitmasks.add(enumDef.name);
      }
    }
    const mavlinkMessages = jsonContent.mavlink.messages?.message;
    if (mavlinkMessages) {
      const messageList = Array.isArray(mavlinkMessages)
        ? mavlinkMessages
        : [mavlinkMessages];
      for (const messageDef of messageList)
        if (!seenMessages.has(messageDef.name)) {
          const extensionFieldNames = getExtensionFields(
            xmlContent,
            messageDef.name,
          );
          const fields = Array.isArray(messageDef.field)
            ? messageDef.field
            : [messageDef.field];
          for (const field of fields)
            if (extensionFieldNames.has(field.name)) field.extension = true;

          messages.push(messageDef);
          seenMessages.add(messageDef.name);
        }
    }
  }

  const enums = Array.from(enumsMap.values());
  const seenEnums = new Set(enumsMap.keys());

  const enumUsage = new Map<string, "bigint" | "number">();
  for (const messageDef of messages) {
    const fields = (
      Array.isArray(messageDef.field) ? messageDef.field : [messageDef.field]
    ).filter(Boolean);
    for (const field of fields)
      if (field.enum) {
        const type = field.type.trim();
        if (type.includes("64")) enumUsage.set(field.enum, "bigint");
        else if (!enumUsage.has(field.enum))
          enumUsage.set(field.enum, "number");
      }
  }

  let output =
    '/* eslint-disable */\n\nimport { createReader, createWriter } from "mavlink.ts";\n\nconst textDecoder = new TextDecoder();\nconst textEncoder = new TextEncoder();\n\n';

  output += `const toMap = <K extends string, V extends number | bigint | string>(obj: Record<K, V>) => new Map<K, V>(Object.entries(obj) as [K, V][]);

const invertMap = <K, V extends number | bigint>(map: Map<K, V>) => new Map<number | bigint, K>([...map].map(([k, v]) => [v, k]));

const decodeBitmask = <T extends string, V extends number | bigint>(value: number | bigint, mapping: Map<V, T>): T[] => {
  const v = BigInt(value);
  const result: T[] = [];
  for (const [key, val] of mapping.entries()) {
    const k = BigInt(key);
    if (k !== 0n && (v & k) === k) {
      result.push(val);
    }
  }
  return result;
};

const encodeBitmask = <T extends string, V extends number | bigint>(value: T[] | V, mapping: Map<T, V>): V => {
  if (Array.isArray(value)) {
    let acc = 0n;
    for (const val of value) acc |= BigInt(mapping.get(val as T) ?? 0);
    const firstVal = mapping.values().next().value;
    return (typeof firstVal === "bigint" ? acc : Number(acc)) as V;
  }
  return value;
};

const lookup = <T extends string, V extends number | bigint>(value: T | V | number | bigint, mapping: Map<T, V>): V => {
  return (typeof value === "string" ? mapping.get(value) : value) as V;
};

`;

  for (const enumDef of enums) {
    const pascalName = toPascalCase(enumDef.name);
    const camelName = toCamelCase(enumDef.name);
    const entries = (
      Array.isArray(enumDef.entry) ? enumDef.entry : [enumDef.entry]
    ).filter(Boolean);
    const is64 = enumUsage.get(enumDef.name) === "bigint";
    output += `export const ${camelName}EnumMap = {\n`;
    for (const entry of entries) {
      const entryName = entry.name.startsWith(enumDef.name + "_")
        ? entry.name.slice(enumDef.name.length + 1)
        : entry.name;
      const key = safeKey(entryName);
      output += `  ${key}: ${is64 ? entry.value + "n" : entry.value},\n`;
    }
    output += "} as const;\n\n";
    output += `export type ${pascalName} = keyof typeof ${camelName}EnumMap;\n`;
    output += `export const ${camelName}Map = toMap(${camelName}EnumMap);\n`;
    output += `export const ${camelName}InverseMap = invertMap(${camelName}Map);\n\n`;
  }

  for (const messageDef of messages) {
    const pascalName = toPascalCase(messageDef.name);
    output += `export type ${pascalName} = {\n`;
    const fields = (
      Array.isArray(messageDef.field) ? messageDef.field : [messageDef.field]
    ).filter(Boolean);
    for (const field of fields) {
      const enumType =
        field.enum && seenEnums.has(field.enum)
          ? toPascalCase(field.enum)
          : null;
      const type = field.type.trim();
      const isArray = type.includes("[");
      const baseType = mapType(type);
      let typeString = enumType && !isArray ? enumType : baseType;
      if (field.enum && bitmasks.has(field.enum) && !isArray)
        typeString = `${enumType}[]`;

      output += `  ${toCamelCase(field.name)}: ${typeString};\n`;
    }
    output += "};\n\n";
  }

  output += "export const schema = {\n";
  for (const messageDef of messages) {
    const pascalName = toPascalCase(messageDef.name);
    const sortedFields = getSortedFields(messageDef);
    const originalFields = (
      Array.isArray(messageDef.field) ? messageDef.field : [messageDef.field]
    ).filter(Boolean);
    const totalSize = originalFields.reduce(
      (sum: number, field: MavlinkField) => {
        const type = field.type.trim();
        if (type.includes("[")) {
          const length = getArrayLength(type);
          const base = type.split("[")[0] ?? "";
          return sum + length * getTypeSize(base);
        }
        return sum + getTypeSize(type);
      },
      0,
    );

    output += `  ${safeKey(messageDef.name)}: {\n    id: ${messageDef.id},\n    crcExtra: ${calculateCrcExtra(messageDef)},\n`;
    output += `    decode(payload: Uint8Array): ${pascalName} {\n`;
    output += `      const reader = createReader(payload, ${totalSize});\n`;

    for (const field of sortedFields) {
      const fieldName = toCamelCase(field.name);
      const type = field.type.trim();
      const { read: readMethod } = getMethods(type);
      if (type === "char")
        output += `      const ${fieldName} = String.fromCharCode(reader.getUint8());\n`;
      else if (type.startsWith("char[")) {
        const length = getArrayLength(type);
        output += `      const ${fieldName} = textDecoder.decode(reader.getUint8Array(${length})).replace(/\\0+$/, "");\n`;
      } else if (type.includes("[")) {
        const length = getArrayLength(type);
        const base = type.split("[")[0] ?? "";
        if (base === "uint8_t")
          output += `      const ${fieldName} = reader.getUint8Array(${length});\n`;
        else {
          const { read: arrayReadMethod } = getMethods(base);
          output += `      const ${fieldName} = [${Array(length)
            .fill(`reader.${arrayReadMethod}()`)
            .join(", ")}] as const;\n`;
        }
      } else output += `      const ${fieldName} = reader.${readMethod}();\n`;
    }
    output += "      return {\n";
    for (const field of originalFields) {
      const fieldName = toCamelCase(field.name);
      const isArray = field.type.trim().includes("[");
      if (field.enum && !isArray)
        if (bitmasks.has(field.enum))
          output += `        ${fieldName}: decodeBitmask(${fieldName}, ${toCamelCase(field.enum)}InverseMap),\n`;
        else
          output += `        ${fieldName}: ${toCamelCase(field.enum)}InverseMap.get(${fieldName}) as ${toPascalCase(field.enum)},\n`;
      else output += `        ${fieldName},\n`;
    }
    output += "      };\n    },\n";

    output += `    encode(_: ${pascalName}) {\n`;
    output += `      const writer = createWriter(${totalSize});\n`;
    for (const field of sortedFields) {
      const fieldName = toCamelCase(field.name);
      const type = field.type.trim();
      const isArray = type.includes("[");
      const isBitmask = !!(field.enum && bitmasks.has(field.enum));
      const valueExpression =
        field.enum && !isArray
          ? isBitmask
            ? `encodeBitmask(_.${fieldName}, ${toCamelCase(field.enum)}Map)`
            : `lookup(_.${fieldName}, ${toCamelCase(field.enum)}Map)`
          : `_.${fieldName}`;

      const { write: writeMethod } = getMethods(type);
      if (type === "char")
        output += `      writer.setUint8(${valueExpression}.charCodeAt(0));\n`;
      else if (type.startsWith("char[")) {
        const length = getArrayLength(type);
        const camelName = toCamelCase(field.name);
        output += `      const ${camelName}Encoded = textEncoder.encode(_.${camelName});\n`;
        output += `      writer.setUint8Array(${camelName}Encoded, ${length});\n`;
      } else if (type.includes("[")) {
        const length = getArrayLength(type);
        const camelName = toCamelCase(field.name);
        const base = type.split("[")[0] ?? "";
        if (base === "uint8_t")
          output += `      writer.setUint8Array(_.${camelName}, ${length});\n`;
        else {
          const { write: arrayWriteMethod } = getMethods(base);
          output += `      _.${camelName}.forEach(writer.${arrayWriteMethod});\n`;
        }
      } else output += `      writer.${writeMethod}(${valueExpression});\n`;
    }
    output += "      return writer.finish();\n    },\n  },\n";
  }
  output +=
    "} as const;\n\nexport type Schema = typeof schema;\nexport type Type = keyof Schema;\n";

  return output;
};

const args = process.argv.slice(2);
let outPath = "./src/schema.ts";
const urls: string[] = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--out" && args[i + 1]) {
    outPath = args[i + 1]!;
    i++;
  } else if (arg?.startsWith("http")) urls.push(arg);
}

if (urls.length === 0) {
  console.error("Usage: generate [--out <path>] <xml-url> [<xml-url>...]");
  process.exit(1);
}

try {
  const code = await generateMavlinkApi(urls);
  console.log("Generated code length: " + code.length);
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(outPath, code);
  console.log(`Successfully wrote to ${outPath}`);
} catch (err) {
  console.error("Error generating API:", err);
  process.exit(1);
}
