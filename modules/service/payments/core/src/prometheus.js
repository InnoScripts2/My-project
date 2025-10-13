/**
 * Minimal Prometheus collector placeholder for the in-memory payment module.
 */
export function createPaymentsPrometheusCollector(_module, _options = {}) {
    return {
        register() {
            // Noop: metrics wiring will be implemented once Prometheus registry is defined
        },
        update() {
            // Noop: runtime metrics are not yet collected for dev payment module
        },
    };
}
