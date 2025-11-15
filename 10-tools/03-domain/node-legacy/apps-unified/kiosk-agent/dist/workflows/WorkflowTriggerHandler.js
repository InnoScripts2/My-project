/**
 * Workflow Trigger Handler
 * Manages workflow triggers (webhook, schedule, event)
 */
import cron from 'node-cron';
export class WorkflowTriggerHandler {
    constructor(expressApp, workflowExecutor, eventEmitter) {
        this.cronJobs = new Map();
        this.expressApp = expressApp;
        this.workflowExecutor = workflowExecutor;
        this.eventEmitter = eventEmitter;
    }
    /**
     * Register webhook trigger
     */
    registerWebhookTrigger(workflowId, webhookPath) {
        this.expressApp.post(webhookPath, async (req, res) => {
            try {
                await this.workflowExecutor.executeWorkflow(workflowId, req.body);
                res.status(200).json({ message: 'Workflow triggered' });
            }
            catch (error) {
                console.error('Webhook trigger error:', error);
                res.status(500).json({ error: 'Failed to trigger workflow' });
            }
        });
    }
    /**
     * Register schedule trigger
     */
    registerScheduleTrigger(workflowId, cronExpression) {
        const task = cron.schedule(cronExpression, async () => {
            try {
                await this.workflowExecutor.executeWorkflow(workflowId, {});
            }
            catch (error) {
                console.error('Schedule trigger error:', error);
            }
        });
        this.cronJobs.set(workflowId, task);
    }
    /**
     * Register event trigger
     */
    registerEventTrigger(workflowId, eventName) {
        this.eventEmitter.on(eventName, async (payload) => {
            try {
                await this.workflowExecutor.executeWorkflow(workflowId, payload);
            }
            catch (error) {
                console.error('Event trigger error:', error);
            }
        });
    }
    /**
     * Unregister schedule trigger
     */
    unregisterScheduleTrigger(workflowId) {
        const task = this.cronJobs.get(workflowId);
        if (task) {
            task.stop();
            this.cronJobs.delete(workflowId);
        }
    }
    /**
     * Handle webhook request manually
     */
    async handleWebhookRequest(req, res) {
        res.status(404).json({ error: 'Webhook not found' });
    }
}
