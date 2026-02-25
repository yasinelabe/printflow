/** @odoo-module */
/*
 * PrintFlow POS Print Service for Odoo 18
 * Copyright 2024 Yasin Elabe
 * License OPL-1
 * 
 * Handles direct printing for:
 * - Customer receipts
 * - Kitchen/preparation tickets
 */

import { patch } from "@web/core/utils/patch";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { renderToElement } from "@web/core/utils/render";
import { useAsyncLockedMethod } from "@point_of_sale/app/utils/hooks";

// Debug flag - set to true to enable verbose logging
const PRINTFLOW_DEBUG = true;

// Global PrintFlow cache (similar to print_direct_odoo approach)
window.printflow = {
    serverUrl: 'https://localhost:5000',
    mainPrinter: null,
    mainMode: 'image',
    printerCache: {},  // { pos_printer_id: printer_name }
    modeCache: {},     // { pos_printer_id: 'image' | 'text' }
};

// ESC/POS commands for paper cutting
const CMD = {
    INIT: '\x1B\x40',
    CUT: '\x1D\x56\x42\x00',
};

function pfLog(...args) {
    if (PRINTFLOW_DEBUG) {
        console.log('[PrintFlow]', ...args);
    }
}

function pfError(...args) {
    console.error('[PrintFlow ERROR]', ...args);
}

/**
 * Load html2canvas library dynamically
 */
async function loadHtml2Canvas() {
    if (window.html2canvas) {
        pfLog('html2canvas already loaded');
        return true;
    }
    
    const loadScript = (src) => {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => resolve(true);
            s.onerror = () => reject(false);
            document.head.appendChild(s);
        });
    };

    try {
        pfLog('Loading html2canvas from local module...');
        await loadScript('/printflow/static/lib/html2canvas.min.js');
        pfLog('html2canvas loaded from local module');
        return true;
    } catch (e) {
        pfLog('Local load failed, trying CDN...');
        try {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
            pfLog('html2canvas loaded from CDN');
            return true;
        } catch (err) {
            pfError('Failed to load html2canvas');
            return false;
        }
    }
}

/**
 * Send print job to PrintFlow agent
 * Returns { successful: true/false, error?: string }
 */
async function sendToPrintFlow(serverUrl, printerName, printType, data) {
    const endpoint = `${serverUrl.replace(/\/$/, '')}/print_raw`;
    
    pfLog('=== SENDING PRINT JOB ===');
    pfLog('Endpoint:', endpoint);
    pfLog('Printer:', printerName);
    pfLog('Type:', printType);
    pfLog('Data length:', data?.length || 0);
    
    try {
        pfLog('Making fetch request...');
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                printer_name: printerName,
                raw_type: printType,
                raw_data: data,
            }),
        });
        
        pfLog('Response status:', response.status);
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            pfLog('Server error response:', err);
            return { successful: false, error: err.error || `Server returned ${response.status}` };
        }
        
        const result = await response.json();
        pfLog('=== PRINT SUCCESS ===', result);
        return { successful: true, ...result };
        
    } catch (error) {
        // Handle connection errors gracefully (agent not running, network issues, etc.)
        if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
            pfLog('PrintFlow agent not reachable - agent may not be running');
            return { 
                successful: false, 
                error: 'PrintFlow agent not reachable. Please ensure the agent is running.',
                agentOffline: true 
            };
        }
        
        pfLog('Print request failed:', error.message);
        return { successful: false, error: error.message };
    }
}

/**
 * Print an HTML element as image to PrintFlow
 * Returns { successful: true/false, error?: string }
 */
async function printElementAsImage(htmlElement, printerName, printerId) {
    await loadHtml2Canvas();
    
    // Create a container for proper rendering
    const container = document.createElement('div');
    container.classList.add('pos-receipt-print', 'pos-receipt');
    container.style.cssText = 'position: fixed; top: 0; left: -9999px; width: 512px; background: #fff; padding: 10px;';
    container.appendChild(htmlElement.cloneNode(true));
    document.body.appendChild(container);
    
    try {
        pfLog('Rendering element to canvas...');
        pfLog('Container dimensions:', container.offsetWidth, 'x', container.offsetHeight);
        
        // Wait for styles to apply
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const canvas = await window.html2canvas(container, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
        });
        
        const base64 = canvas.toDataURL('image/png').split(',')[1];
        pfLog('Image captured, data length:', base64?.length);
        
        // Send the image
        const imageResult = await sendToPrintFlow(window.printflow.serverUrl, printerName, 'image', base64);
        if (!imageResult.successful) {
            pfLog('Image print failed:', imageResult.error);
            return imageResult;
        }
        
        // Send cut command after image
        pfLog('Sending cut command...');
        const cutData = btoa(String.fromCharCode(...[...CMD.CUT].map(c => c.charCodeAt(0))));
        await sendToPrintFlow(window.printflow.serverUrl, printerName, 'text', cutData);
        
        pfLog('Print job completed successfully!');
        return { successful: true };
        
    } catch (error) {
        pfLog('Error rendering/capturing image:', error.message);
        return { successful: false, error: error.message };
    } finally {
        document.body.removeChild(container);
    }
}

// ============================================================
// Patch PosStore for initialization and kitchen printing
// ============================================================
pfLog('Patching PosStore for PrintFlow...');

patch(PosStore.prototype, {
    /**
     * Override setup to load PrintFlow configuration
     */
    async setup() {
        await super.setup(...arguments);
        
        pfLog('========================================');
        pfLog('PrintFlow POS Setup Starting...');
        pfLog('========================================');
        
        const config = this.config || this.env?.services?.pos?.config;
        
        // 1. Get server URL
        if (config?.pf_server_address) {
            window.printflow.serverUrl = config.pf_server_address.replace(/\/$/, '');
            pfLog('Server URL from POS config:', window.printflow.serverUrl);
        }
        
        // 2. Get main receipt printer settings
        if (config?.pf_receipt_printer) {
            window.printflow.mainPrinter = config.pf_receipt_printer;
            pfLog('Main receipt printer:', window.printflow.mainPrinter);
        }
        
        window.printflow.mainMode = config?.pf_output_format || 'image';
        pfLog('Main output mode:', window.printflow.mainMode);
        
        // 3. Load kitchen printer configurations from database
        pfLog('Loading kitchen printer configurations...');
        if (config?.printer_ids && config.printer_ids.length > 0) {
            try {
                const printerIds = config.printer_ids.map(p => (typeof p === 'object' ? p.id : p));
                pfLog('Printer IDs to load:', printerIds);
                
                const printersData = await this.env.services.orm.call(
                    'pos.printer',
                    'search_read',
                    [[['id', 'in', printerIds]]],
                    { fields: ['name', 'pf_target_printer', 'pf_ticket_format'] }
                );
                
                pfLog('Loaded printer data:', printersData);
                
                // Cache the printer configurations
                printersData.forEach(p => {
                    if (p.pf_target_printer) {
                        window.printflow.printerCache[p.id] = p.pf_target_printer;
                        window.printflow.modeCache[p.id] = p.pf_ticket_format || 'image';
                        pfLog(`Cached printer ${p.id}: ${p.pf_target_printer} (${p.pf_ticket_format})`);
                    }
                });
                
            } catch (err) {
                pfError('Error loading printer configurations:', err);
            }
        }
        
        pfLog('========================================');
        pfLog('PrintFlow Setup Complete');
        pfLog('Server URL:', window.printflow.serverUrl);
        pfLog('Main Printer:', window.printflow.mainPrinter || 'Not configured');
        pfLog('Cached Printers:', Object.keys(window.printflow.printerCache).length);
        pfLog('========================================');
    },
    
    /**
     * Override printChanges to handle kitchen ticket printing via PrintFlow
     * This is the method called when order changes need to be printed to kitchen
     */
    async printChanges(order, orderChange, reprint = false, printers = this.unwatched.printers) {
        pfLog('=== printChanges() called ===');
        pfLog('Order:', order?.name || order?.uid);
        pfLog('Reprint:', reprint);
        pfLog('Printers count:', printers?.length || 0);
        
        // Get target printers
        let targetPrinters = printers;
        if ((!targetPrinters || targetPrinters.length === 0) && this.config.printer_ids) {
            targetPrinters = this.config.printer_ids.map(id => ({
                config: { id: (typeof id === 'object' ? id.id : id), product_categories_ids: [] }
            }));
            pfLog('Using printer_ids as fallback:', targetPrinters.length);
        }
        
        if (!targetPrinters || targetPrinters.length === 0) {
            pfLog('No printers available');
            return true;
        }
        
        // Ensure html2canvas is loaded
        await loadHtml2Canvas();
        
        // Process each printer
        for (const printer of targetPrinters) {
            const printerId = printer.config?.id;
            const pfPrinterName = window.printflow.printerCache[printerId];
            const pfMode = window.printflow.modeCache[printerId] || 'image';
            
            pfLog(`Processing printer ${printerId}:`, {
                pfPrinterName,
                pfMode,
                categories: printer.config?.product_categories_ids,
            });
            
            // Only handle printers with PrintFlow configuration
            if (!pfPrinterName) {
                pfLog(`Printer ${printerId} has no PrintFlow config, skipping`);
                continue;
            }
            
            try {
                // Get the changes to print
                const changesList = Array.isArray(orderChange) ? orderChange : [orderChange];
                
                for (const change of changesList) {
                    pfLog('Processing change:', change);
                    
                    // Generate receipt data
                    let receiptsData = [];
                    try {
                        const { orderData, changes } = this.generateOrderChange(
                            order,
                            change,
                            printer.config.product_categories_ids || [],
                            reprint
                        );
                        receiptsData = await this.generateReceiptsDataToPrint(orderData, changes, change);
                    } catch (e) {
                        pfLog('Falling back to direct change data');
                        receiptsData = [{
                            changes: {
                                new: change.new || [],
                                cancelled: change.cancelled || [],
                                config_name: this.config.name,
                                employee_name: this.get_cashier?.()?.name || '',
                                time: new Date().toLocaleTimeString(),
                                table_name: order.table?.name || '',
                                tracking_number: order.tracking_number,
                            },
                            changedlines: change.new || change.cancelled || [],
                        }];
                    }
                    
                    for (const data of receiptsData) {
                        // Prepare changed lines
                        let changedLines = [];
                        if (data.changes?.new) changedLines = changedLines.concat(data.changes.new);
                        if (data.changes?.cancelled) changedLines = changedLines.concat(data.changes.cancelled);
                        if (changedLines.length === 0 && data.changedlines) {
                            changedLines = data.changedlines;
                        }
                        
                        if (changedLines.length === 0) {
                            pfLog('No changed lines to print');
                            continue;
                        }
                        
                        // Ensure data.changes has required fields
                        if (!data.changes) data.changes = {};
                        data.changes.config_name = data.changes.config_name || this.config.name;
                        data.changes.employee_name = data.changes.employee_name || this.get_cashier?.()?.name || '';
                        data.changes.time = data.changes.time || new Date().toLocaleTimeString();
                        data.changes.table_name = data.changes.table_name || order.table?.name || '';
                        data.changes.tracking_number = data.changes.tracking_number || order.tracking_number;
                        data.changedlines = changedLines;
                        
                        pfLog('Printing receipt data:', {
                            changedlines: changedLines.length,
                            config_name: data.changes.config_name,
                            mode: pfMode,
                        });
                        
                        let printResult;
                        
                        if (pfMode === 'text' || pfMode === 'raw') {
                            // Text mode - format as plain text
                            pfLog('Printing in TEXT mode');
                            const textContent = this._formatKitchenTicketText(data, order);
                            const textData = btoa(unescape(encodeURIComponent(textContent)));
                            printResult = await sendToPrintFlow(window.printflow.serverUrl, pfPrinterName, 'text', textData);
                        } else {
                            // Image mode - render QWeb template and capture as image
                            pfLog('Printing in IMAGE mode');
                            try {
                                const receiptElement = renderToElement('point_of_sale.OrderChangeReceipt', {
                                    changes: data.changes,
                                    changedlines: data.changedlines,
                                    operational_title: data.operational_title || '',
                                    order: order,
                                    formatCurrency: (a) => this.env.utils.formatCurrency(a),
                                });
                                
                                pfLog('Receipt element rendered');
                                printResult = await printElementAsImage(receiptElement, pfPrinterName, printerId);
                                
                            } catch (renderErr) {
                                pfLog('QWeb render failed, using fallback:', renderErr.message);
                                // Fallback - create simple HTML
                                const div = document.createElement('div');
                                div.style.cssText = 'font-family: monospace; font-size: 14px; padding: 20px;';
                                div.innerHTML = `
                                    <h2 style="text-align: center;">KITCHEN ORDER</h2>
                                    <p>Time: ${data.changes.time}</p>
                                    <p>Table: ${data.changes.table_name || 'N/A'}</p>
                                    <hr>
                                    <pre>${this._formatKitchenTicketText(data, order)}</pre>
                                `;
                                printResult = await printElementAsImage(div, pfPrinterName, printerId);
                            }
                        }
                        
                        // Log result but don't fail the order process
                        if (printResult && !printResult.successful) {
                            pfLog(`Print to ${pfPrinterName} was not successful:`, printResult.error || 'Unknown error');
                            if (printResult.agentOffline) {
                                pfLog('PrintFlow agent appears to be offline');
                            }
                        }
                    }
                }
            } catch (error) {
                // Log error but don't fail the order process
                pfLog(`Error in print process for ${pfPrinterName}:`, error.message);
            }
        }
        
        // Always return true to not block the order flow
        return true;
    },
    
    /**
     * Format kitchen ticket as plain text
     */
    _formatKitchenTicketText(data, order) {
        const lines = [];
        const width = 42;
        const line = () => '-'.repeat(width);
        
        lines.push('');
        lines.push('        KITCHEN ORDER');
        lines.push(`Time: ${data.changes?.time || new Date().toLocaleTimeString()}`);
        lines.push(line());
        
        const tableName = data.changes?.table_name || order?.table?.name || '';
        if (tableName) {
            lines.push(`Table: ${tableName}`);
        }
        
        const trackingNum = data.changes?.tracking_number || order?.tracking_number || '';
        if (trackingNum) {
            lines.push(`Order #: ${trackingNum}`);
        }
        
        lines.push(line());
        
        // New items
        const newItems = data.changes?.new || [];
        if (newItems.length > 0) {
            lines.push('NEW ITEMS:');
            newItems.forEach(item => {
                const qty = item.qty || 1;
                const name = item.name_wrapped?.[0] || item.name || item.product_name || 'Item';
                lines.push(`  ${qty}x ${name}`);
                if (item.note) {
                    lines.push(`     Note: ${item.note}`);
                }
            });
            lines.push('');
        }
        
        // Cancelled items
        const cancelledItems = data.changes?.cancelled || [];
        if (cancelledItems.length > 0) {
            lines.push('CANCELLED:');
            cancelledItems.forEach(item => {
                const qty = item.qty || 1;
                const name = item.name_wrapped?.[0] || item.name || item.product_name || 'Item';
                lines.push(`  ${qty}x ${name}`);
            });
            lines.push('');
        }
        
        lines.push(line());
        lines.push('');
        
        return lines.join('\n');
    },
    
    /**
     * Override sendOrderInPreparation to add logging
     */
    async sendOrderInPreparation(order, cancelled = false) {
        pfLog('=== sendOrderInPreparation() called ===');
        pfLog('Order:', order?.name || order?.uid);
        pfLog('Cancelled:', cancelled);
        pfLog('Printers available:', this.unwatched?.printers?.length || 0);
        
        if (this.unwatched?.printers) {
            this.unwatched.printers.forEach((printer, idx) => {
                const printerId = printer.config?.id;
                pfLog(`Printer ${idx}:`, {
                    id: printerId,
                    pf_target_printer: window.printflow.printerCache[printerId],
                    pf_mode: window.printflow.modeCache[printerId],
                    categories: printer.config?.product_categories_ids,
                });
            });
        }
        
        return super.sendOrderInPreparation(order, cancelled);
    },
});

// ============================================================
// Patch ReceiptScreen for customer receipt printing
// ============================================================
pfLog('Patching ReceiptScreen for PrintFlow...');

patch(ReceiptScreen.prototype, {
    setup() {
        super.setup(...arguments);
        pfLog('ReceiptScreen.setup() called');
        
        // Override print methods with PrintFlow versions
        const printToAgent = async () => {
            if (!window.printflow.mainPrinter) {
                pfLog('No main printer configured for receipts');
                return false;
            }
            
            const mode = window.printflow.mainMode || 'image';
            pfLog('Printing receipt with mode:', mode);
            
            const receiptEl = document.querySelector('.pos-receipt');
            if (!receiptEl) {
                pfLog('Receipt element not found in DOM');
                return false;
            }
            
            try {
                await loadHtml2Canvas();
                
                let printResult;
                
                if (mode === 'text' || mode === 'raw') {
                    pfLog('Using TEXT mode for receipt');
                    const order = this.pos.get_order();
                    const text = this._formatReceiptText(order);
                    const textData = btoa(unescape(encodeURIComponent(text)));
                    printResult = await sendToPrintFlow(window.printflow.serverUrl, window.printflow.mainPrinter, 'text', textData);
                } else {
                    pfLog('Using IMAGE mode for receipt');
                    const canvas = await window.html2canvas(receiptEl, {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        logging: false,
                    });
                    const base64 = canvas.toDataURL('image/png').split(',')[1];
                    
                    printResult = await sendToPrintFlow(window.printflow.serverUrl, window.printflow.mainPrinter, 'image', base64);
                    
                    if (printResult.successful) {
                        // Send cut command only if image was sent successfully
                        const cutData = btoa(String.fromCharCode(...[...CMD.CUT].map(c => c.charCodeAt(0))));
                        await sendToPrintFlow(window.printflow.serverUrl, window.printflow.mainPrinter, 'text', cutData);
                    }
                }
                
                if (printResult && !printResult.successful) {
                    pfLog('Receipt print was not successful:', printResult.error);
                    if (printResult.agentOffline) {
                        pfLog('PrintFlow agent is offline - falling back to browser print');
                    }
                    return false; // Fall back to browser print
                }
                
                pfLog('Receipt printed successfully!');
                return true;
                
            } catch (error) {
                pfError('Receipt printing failed:', error);
                return false;
            }
        };
        
        // Replace print methods
        this.doFullPrint = useAsyncLockedMethod(async () => {
            if (await printToAgent()) return;
            window.print();
        });
        
        this.doBasicPrint = useAsyncLockedMethod(async () => {
            if (await printToAgent()) return;
            window.print();
        });
    },
    
    /**
     * Format order as simple text receipt
     */
    _formatReceiptText(order) {
        const ESC = {
            INIT: '\x1B\x40',
            LF: '\x0A',
            CENTER: '\x1B\x61\x01',
            LEFT: '\x1B\x61\x00',
            BOLD_ON: '\x1B\x45\x01',
            BOLD_OFF: '\x1B\x45\x00',
            DOUBLE: '\x1B\x21\x30',
            NORMAL: '\x1B\x21\x00',
        };
        
        const lines = [ESC.INIT];
        const company = this.pos.company;
        
        lines.push(ESC.CENTER, ESC.DOUBLE);
        lines.push(company?.name || 'Receipt');
        lines.push(ESC.NORMAL, ESC.LF, ESC.LF);
        
        lines.push(ESC.LEFT);
        lines.push(`Order: ${order?.name || order?.uid || ''}`);
        lines.push(ESC.LF);
        lines.push(`Date: ${new Date().toLocaleString()}`);
        lines.push(ESC.LF);
        lines.push('================================');
        lines.push(ESC.LF);
        
        const orderLines = order?.get_orderlines?.() || [];
        for (const line of orderLines) {
            const qty = line.get_quantity?.() || line.quantity || 1;
            const name = line.get_full_product_name?.() || line.product?.display_name || 'Item';
            const price = line.get_price_with_tax?.() || 0;
            
            lines.push(`${qty}x ${name}`);
            lines.push(ESC.LF);
            lines.push(`     ${price.toFixed(2)}`);
            lines.push(ESC.LF);
        }
        
        lines.push('================================');
        lines.push(ESC.LF);
        
        const total = order?.get_total_with_tax?.() || 0;
        lines.push(ESC.BOLD_ON);
        lines.push(`TOTAL: ${total.toFixed(2)}`);
        lines.push(ESC.BOLD_OFF, ESC.LF, ESC.LF, ESC.LF);
        
        return lines.join('');
    },
});

// Log that the module loaded
pfLog('========================================');
pfLog('PrintFlow POS Print Service LOADED');
pfLog('Debug mode:', PRINTFLOW_DEBUG);
pfLog('Patches applied: PosStore, ReceiptScreen');
pfLog('========================================');
