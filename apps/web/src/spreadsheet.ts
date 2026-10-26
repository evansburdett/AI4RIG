/**
 * Opening an .xlsx file the advisor picked, in the browser. Nothing is
 * uploaded: the file is read here and only what the advisor confirms is sent
 * to the API.
 *
 * Numbers come back as their text so the import can read them exactly
 * (domain/decimal.ts) rather than as floating-point approximations.
 */

import readExcelFile from 'read-excel-file/browser';

export type SheetRows = readonly (readonly unknown[])[];

/** The first sheet with anything in it, as rows of cells. */
export async function readFirstSheet(file: File): Promise<SheetRows> {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new Error('Choose an Excel file (.xlsx). An older .xls or a .csv has to be saved as .xlsx first.');
  }
  const sheets = await readExcelFile(file, { parseNumber: (text: string) => text });
  const withData = sheets.find((sheet) => sheet.data.some((row) => row.some((cell) => cell !== null && cell !== '')));
  if (withData === undefined) throw new Error(`${file.name} is empty.`);
  return withData.data;
}
