/**
 * Simple structured logger utility
 */
class SimpleLogger {
    constructor(module) {
        this.module = module;
    }
    debug(message, context) {
        this.log('debug', message, context);
    }
    info(message, context) {
        this.log('info', message, context);
    }
    warn(message, context) {
        this.log('warn', message, context);
    }
    error(message, context) {
        this.log('error', message, context);
    }
    log(level, message, context) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            module: this.module,
            message,
            context,
        };
        const output = JSON.stringify(entry);
        if (level === 'error') {
            console.error(output);
        }
        else if (level === 'warn') {
            console.warn(output);
        }
        else if (process.env.AGENT_ENV === 'DEV' || level === 'info') {
            console.log(output);
        }
    }
}
export function createLogger(module) {
    return new SimpleLogger(module);
}
