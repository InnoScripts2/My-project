/**
 * Prometheus Metrics Collector for OBD-II Driver
 * Exports driver metrics for monitoring and alerting
 */
import { Registry } from 'prom-client';
import type { Elm327Driver } from './Elm327Driver.js';
export interface ObdPrometheusCollector {
    readonly register: Registry;
    update(): void;
}
export interface ObdPrometheusOptions {
    register?: Registry;
}
export declare function createObdPrometheusCollector(driver: Elm327Driver, options?: ObdPrometheusOptions): ObdPrometheusCollector;
