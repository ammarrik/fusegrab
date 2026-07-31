import { existsSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DownloadLogger } from './service'

describe('DownloadLogger', () => {
    let testDir: string

    beforeEach(() => {
        testDir = path.join(os.tmpdir(), `fusegrab_test_logger_${Date.now()}`)
    })

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true }).catch(() => undefined)
    })

    it('creates hidden log file and deletes it on successful endSession', async () => {
        const logger = new DownloadLogger(testDir)
        const logFilePath = path.join(testDir, '.fusegrab_download.log')

        logger.startSession('Test Video Download', { url: 'https://youtube.com/watch?v=123' })
        logger.info('Resolving binary')
        logger.logStdoutLine('[download] 50% of 10MiB')
        logger.info('Download complete')

        expect(existsSync(logFilePath)).toBe(true)

        await logger.endSession(true)

        // Log file should be deleted on success
        expect(existsSync(logFilePath)).toBe(false)
    })

    it('retains hidden log file when session fails or error is logged', async () => {
        const logger = new DownloadLogger(testDir)
        const logFilePath = path.join(testDir, '.fusegrab_download.log')

        logger.startSession('Failing Video Download', { url: 'https://youtube.com/watch?v=456' })
        logger.info('Step 1: Starting')
        logger.error('Failed to download video format', new Error('Network timeout'))

        expect(existsSync(logFilePath)).toBe(true)

        await logger.endSession(false)

        // Log file MUST be retained on failure
        expect(existsSync(logFilePath)).toBe(true)

        const content = readFileSync(logFilePath, 'utf-8')
        expect(content).toContain('STARTING DOWNLOAD SESSION: Failing Video Download')
        expect(content).toContain('[ERROR] Failed to download video format')
        expect(content).toContain('Network timeout')
        expect(content).toContain('SESSION ENDED: FINISHED WITH ERRORS')
    })

    it('logs binary warnings and fetch failures', async () => {
        const logger = new DownloadLogger(testDir)
        const logFilePath = path.join(testDir, '.fusegrab_download.log')

        logger.startSession('Binary Check Session')
        logger.info('Resolving aria2 binary...')
        logger.warn('Failed to download/load aria2 binary: HTTP 404 Not Found', new Error('HTTP 404'))

        expect(existsSync(logFilePath)).toBe(true)
        await logger.endSession(false)

        const content = readFileSync(logFilePath, 'utf-8')
        expect(content).toContain('[WARN] Failed to download/load aria2 binary: HTTP 404 Not Found | Details: HTTP 404')
    })
})
