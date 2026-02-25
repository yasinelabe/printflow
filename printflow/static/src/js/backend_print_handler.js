/** @odoo-module */
/*
 * PrintFlow Backend Print Handler
 * Copyright 2024 Yasin Elabe
 * License OPL-1
 */

import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";

/**
 * Service to handle direct printing from backend views
 */
export const printFlowService = {
    dependencies: ["notification", "action"],
    
    start(env, { notification, action }) {
        let cachedServerUrl = null;
        
        async function getServerUrl() {
            if (!cachedServerUrl) {
                try {
                    cachedServerUrl = await rpc('/web/dataset/call_kw', {
                        model: 'ir.config_parameter',
                        method: 'get_param',
                        args: ['printflow.server_url', 'https://localhost:5000'],
                        kwargs: {},
                    });
                } catch {
                    cachedServerUrl = 'https://localhost:5000';
                }
            }
            return cachedServerUrl;
        }
        
        async function sendToPrinter(printerName, pdfBase64, copies = 1) {
            const serverUrl = await getServerUrl();
            
            for (let i = 0; i < copies; i++) {
                try {
                    const response = await fetch(`${serverUrl}/print_raw`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            printer_name: printerName,
                            raw_type: 'pdf',
                            raw_data: pdfBase64,
                        }),
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Print server returned ${response.status}`);
                    }
                } catch (error) {
                    notification.add(`Print failed: ${error.message}`, {
                        type: 'danger',
                        title: 'PrintFlow Error',
                    });
                    return false;
                }
            }
            
            notification.add(`Sent to ${printerName}`, {
                type: 'success',
                title: 'Print Job Queued',
            });
            return true;
        }
        
        async function printReport(reportId, recordIds, printerName, copies = 1) {
            try {
                // Generate PDF
                const pdfUrl = `/report/pdf/${reportId}/${recordIds.join(',')}`;
                const response = await fetch(pdfUrl);
                
                if (!response.ok) {
                    throw new Error('Failed to generate PDF');
                }
                
                const pdfBlob = await response.blob();
                const reader = new FileReader();
                
                return new Promise((resolve, reject) => {
                    reader.onload = async () => {
                        const base64 = reader.result.split(',')[1];
                        const result = await sendToPrinter(printerName, base64, copies);
                        resolve(result);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(pdfBlob);
                });
                
            } catch (error) {
                notification.add(`Report generation failed: ${error.message}`, {
                    type: 'danger',
                    title: 'PrintFlow Error',
                });
                return false;
            }
        }
        
        return {
            getServerUrl,
            sendToPrinter,
            printReport,
        };
    },
};

registry.category("services").add("printflow", printFlowService);
