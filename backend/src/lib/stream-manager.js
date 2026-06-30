import { EventEmitter } from "node:events";

class StreamManager {
    constructor() {
        this.clients = new Map();
        this.events = new EventEmitter();
    }

    /**
     * Adds a new client to the stream for a specific payment ID.
     */
    addClient(paymentId, res) {
        if (!this.clients.has(paymentId)) {
            this.clients.set(paymentId, new Set());
        }
        this.clients.get(paymentId).add(res);

        // Initial keep-alive or connection confirmation
        res.write(`data: ${JSON.stringify({ status: "connected", payment_id: paymentId })}\n\n`);

        // Clean up when client disconnects
        res.on("close", () => {
            const clientSet = this.clients.get(paymentId);
            if (clientSet) {
                clientSet.delete(res);
                if (clientSet.size === 0) {
                    this.clients.delete(paymentId);
                }
            }
        });
    }

    /**
     * Pushes a data payload to all clients watching a payment ID.
     */
    notify(paymentId, eventName, data) {
        const clients = this.clients.get(paymentId);
        if (!clients) return;

        const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
        clients.forEach((res) => {
            res.write(payload);
        });
    }
}

export const streamManager = new StreamManager();
