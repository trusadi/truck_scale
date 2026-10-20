"use client";

export type InboundImportRow = {
  date: string;
  time: string;
  type: "PO" | "STO";
  document: string;
  supplier: string;
  plate: string;
  driver: string;
  item: string;
  material: string;
  product: string;
  quantity: number;
  unit: "KG";
};

async function zipEntry(bytes: ArrayBuffer, wanted: string): Promise<string> {
  const view = new DataView(bytes);
  const decoder = new TextDecoder();
  let end = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65558); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("This is not a valid .xlsx workbook.");
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("The Excel workbook is damaged.");
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(new Uint8Array(bytes, cursor + 46, nameLength));
    if (name === wanted) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = new Uint8Array(bytes, start, compressedSize);
      if (method === 0) return decoder.decode(compressed);
      if (method !== 8) throw new Error("This Excel compression format is not supported.");
      const exactBuffer = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer;
      const stream = new Blob([exactBuffer]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
      return decoder.decode(await new Response(stream).arrayBuffer());
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("The workbook is missing " + wanted + ".");
}

function columnIndex(reference: string) {
  let n = 0;
  for (const char of reference.match(/[A-Z]+/i)?.[0].toUpperCase() ?? "") n = n * 26 + char.charCodeAt(0) - 64;
  return n - 1;
}
function excelDate(value: string) {
  if (!value) return "";
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Number(value) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  return value.slice(0, 10);
}
function excelTime(value: string) {
  if (!value) return "";
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const minutes = Math.round((Number(value) % 1) * 1440);
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const match = value.match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : value;
}
function cellText(cell: Element, shared: string[]) {
  const value = cell.getElementsByTagName("v")[0]?.textContent ?? "";
  if (cell.getAttribute("t") === "s") return shared[Number(value)] ?? "";
  if (cell.getAttribute("t") === "inlineStr") return cell.getElementsByTagName("t")[0]?.textContent ?? "";
  return value;
}

export async function parseInboundWorkbook(file: File): Promise<InboundImportRow[]> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Select an Excel .xlsx file.");
  if (file.size > 10 * 1024 * 1024) throw new Error("The workbook must be smaller than 10 MB.");
  const bytes = await file.arrayBuffer();
  let shared: string[] = [];
  try {
    const xml = new DOMParser().parseFromString(await zipEntry(bytes, "xl/sharedStrings.xml"), "application/xml");
    shared = Array.from(xml.getElementsByTagName("si"), (item) => Array.from(item.getElementsByTagName("t"), (node) => node.textContent ?? "").join(""));
  } catch { /* Excel files may store all strings inline. */ }
  const sheet = new DOMParser().parseFromString(await zipEntry(bytes, "xl/worksheets/sheet1.xml"), "application/xml");
  if (sheet.getElementsByTagName("parsererror").length) throw new Error("The first worksheet contains invalid XML.");
  const rows = Array.from(sheet.getElementsByTagName("row"));
  const parsed = rows.map((row) => {
    const cells = new Map<string, string>();
    for (const cell of Array.from(row.getElementsByTagName("c"))) {
      const ref = cell.getAttribute("r") ?? "";
      cells.set(String(columnIndex(ref)), cellText(cell, shared).trim());
    }
    return cells;
  });
  const headerIndex = parsed.findIndex((row) => {
    const values = [...row.values()].map((value) => value.toLowerCase().replace(/[^a-z]/g, ""));
    return values.includes("date") && values.includes("time") && values.some((value) => value.includes("expectednetcargo"));
  });
  if (headerIndex < 0) throw new Error("Could not find the template header row. Use the provided inbound template columns.");
  const header = parsed[headerIndex];
  const indexes = new Map([...header].map(([column, value]) => [value.toLowerCase().replace(/[^a-z]/g, ""), Number(column)]));
  const find = (...names: string[]) => names.map((name) => indexes.get(name)).find((index) => index !== undefined);
  const columns = {
    date: find("date"), time: find("time"), type: find("inbtype", "inboundtype"), document: find("postoshipmentno", "postoshipmentnumber"),
    supplier: find("suppliercode"), plate: find("truckplate"), driver: find("drivername"), item: find("item"), material: find("productcode"),
    product: find("product"), quantity: find("expectednetcargo"), unit: find("uom"),
  };
  if (Object.values(columns).some((index) => index === undefined)) throw new Error("The workbook headers do not match the inbound upload template.");
  const get = (row: Map<string, string>, index: number | undefined) => index === undefined ? "" : row.get(String(index)) ?? "";
  const result: InboundImportRow[] = [];
  for (const row of parsed.slice(headerIndex + 1)) {
    const hasDeliveryData = [columns.date, columns.time, columns.document, columns.supplier, columns.plate, columns.driver, columns.item, columns.material, columns.product, columns.quantity, columns.unit]
      .some((index) => get(row, index).trim() !== "");
    if (!hasDeliveryData) continue;
    const rawType = get(row, columns.type).toUpperCase();
    const type = rawType === "PO" ? "PO" : ["STO", "SHIP", "SHIPMENT"].includes(rawType) ? "STO" : null;
    const quantity = Number(get(row, columns.quantity).replace(/,/g, ""));
    const date = excelDate(get(row, columns.date));
    const time = excelTime(get(row, columns.time));
    const document = get(row, columns.document);
    const material = get(row, columns.material);
    const product = get(row, columns.product);
    const itemRaw = get(row, columns.item);
    const item = /^\d+$/.test(itemRaw) ? itemRaw.padStart(5, "0") : itemRaw;
    const unit = get(row, columns.unit).toUpperCase();
    if (!type || !date || !time || !document || !item || !material || !product || !Number.isFinite(quantity) || quantity <= 0 || !["KG", "KGS", "KILOGRAM", "KILOGRAMS"].includes(unit))
      throw new Error(`Invalid data on Excel row ${headerIndex + result.length + 2}. Check type, date, time, document, item, product, expected cargo, and UoM (KG).`);
    result.push({ date, time, type, document, supplier: get(row, columns.supplier), plate: get(row, columns.plate), driver: get(row, columns.driver), item, material, product, quantity, unit: "KG" });
    if (result.length > 500) throw new Error("A single upload can contain up to 500 product rows.");
  }
  if (!result.length) throw new Error("The workbook contains no delivery rows.");
  return result;
}
