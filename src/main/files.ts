import { BrowserWindow, dialog, type WebContents } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { FileFilter } from '../shared/api'
import { mppToXml } from './mpp'

const MAX_BYTES = 100 * 1024 * 1024

/** Lets the user pick a text file and returns its contents; null if they cancel. */
export async function openTextFile(sender: WebContents, filters: FileFilter[]): Promise<{ name: string; text: string } | null> {
  const win = BrowserWindow.fromWebContents(sender)
  const options = { properties: ['openFile' as const], filters }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const path = result.filePaths[0]
  if (result.canceled || !path) return null
  if ((await stat(path)).size > MAX_BYTES) throw new Error('El archivo es demasiado grande (más de 100 MB).')
  // A binary MS Project file is turned into MS Project XML here, so the renderer only ever parses XML.
  if (/\.mpp$/i.test(path)) return { name: basename(path), text: await mppToXml(path, process.resourcesPath) }
  return { name: basename(path), text: await readFile(path, 'utf8') }
}

/** Asks where to save and writes the text there; returns the path, or null if they cancel. */
export async function saveTextFile(sender: WebContents, defaultName: string, text: string, filters: FileFilter[]): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(sender)
  const options = { defaultPath: defaultName, filters }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, text, 'utf8')
  return result.filePath
}
