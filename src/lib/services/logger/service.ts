import type { LogLevel } from './types'

import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export type { LogLevel }

export class DownloadLogger {
    private downloadDir: string | null = null
    private logFilePath: string | null = null
    private hasError = false
    private active = false

    constructor(downloadDir: string) {
        this.downloadDir = downloadDir
        try {
            if (!existsSync(downloadDir)) {
                mkdirSync(downloadDir, { recursive: true })
            }
            this.logFilePath = path.join(downloadDir, '.fusegrab_download.log')
            this.active = true
        } catch (e) {
            console.error('Failed to initialize DownloadLogger:', e)
            this.active = false
        }
    }

    public startSession(sessionTitle: string, details?: Record<string, any>) {
        if (!this.active || !this.logFilePath) return
        const timestamp = new Date().toISOString()
        const banner = [
            '================================================================================',
            `[${timestamp}] STARTING DOWNLOAD SESSION: ${sessionTitle}`,
            `[${timestamp}] Download Directory: ${this.downloadDir}`,
            `[${timestamp}] OS: ${process.platform} ${process.arch} (${os.release()})`,
            `[${timestamp}] Node: ${process.version}, Electron: ${process.versions.electron || 'N/A'}`,
            ...(details
                ? [
                      `[${timestamp}] Details: ${JSON.stringify(details, null, 2)}`,
                  ]
                : []),
            '================================================================================\n',
        ].join('\n')
        this.write(banner)
    }

    public info(message: string) {
        this.log('INFO', message)
    }

    public debug(message: string) {
        this.log('DEBUG', message)
    }

    public warn(message: string, errorObj?: any) {
        let warnDetails = message
        if (errorObj) {
            if (errorObj instanceof Error) {
                warnDetails += ` | Details: ${errorObj.message}`
            } else {
                warnDetails += ` | Details: ${String(errorObj)}`
            }
        }
        this.log('WARN', warnDetails)
    }

    public error(message: string, errorObj?: any) {
        this.hasError = true
        let errorDetails = message
        if (errorObj) {
            if (errorObj instanceof Error) {
                errorDetails += ` | Error: ${errorObj.message}\nStack: ${errorObj.stack}`
            } else {
                errorDetails += ` | Error: ${String(errorObj)}`
            }
        }
        this.log('ERROR', errorDetails)
    }

    public logStdoutLine(line: string) {
        const trimmed = line.trim()
        if (!trimmed) return
        if (/ERROR:/i.test(trimmed) || /\[error\]/i.test(trimmed)) {
            this.hasError = true
        }
        this.log('STDOUT', trimmed)
    }

    public logStderrLine(line: string) {
        const trimmed = line.trim()
        if (!trimmed) return
        if (
            /ERROR:/i.test(trimmed) ||
            /fatal:/i.test(trimmed) ||
            /\[error\]/i.test(trimmed)
        ) {
            this.hasError = true
        }
        this.log('STDERR', trimmed)
    }

    private log(level: LogLevel, message: string) {
        if (!this.active || !this.logFilePath) return
        const timestamp = new Date().toISOString()
        const formatted = `[${timestamp}] [${level}] ${message}\n`
        this.write(formatted)
    }

    private write(data: string) {
        if (!this.logFilePath) return
        try {
            appendFileSync(this.logFilePath, data, 'utf-8')
        } catch (e) {
            console.error('Failed writing to download log:', e)
        }
    }

    public async endSession(wasSuccessful = true): Promise<void> {
        if (!this.active || !this.logFilePath) return
        this.active = false

        if (!wasSuccessful) {
            this.hasError = true
        }

        const timestamp = new Date().toISOString()
        const endStatus = this.hasError
            ? 'FINISHED WITH ERRORS'
            : 'COMPLETED SUCCESSFULLY'
        const footer = [
            `\n================================================================================`,
            `[${timestamp}] SESSION ENDED: ${endStatus}`,
            `[${timestamp}] Log file: ${
                this.hasError
                    ? 'RETAINED at ' + this.logFilePath
                    : 'DELETING (All downloads succeeded)'
            }`,
            '================================================================================\n',
        ].join('\n')

        this.write(footer)

        if (
            !this.hasError &&
            this.logFilePath &&
            existsSync(this.logFilePath)
        ) {
            try {
                await rm(this.logFilePath, { force: true })
            } catch (e) {
                console.error('Failed to remove download log file:', e)
            }
        }
    }
}
