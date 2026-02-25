/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { BasePrinter } from "@point_of_sale/app/printer/base_printer";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { useAsyncLockedMethod } from "@point_of_sale/app/utils/hooks";
import { renderToElement } from "@web/core/utils/render";
import { _t } from "@web/core/l10n/translation";


// Variables globales
odoo.agent_url = "https://localhost:5000";
odoo.agent_printers_cache = {};        // { pos_printer_id: printer_name }
odoo.agent_modes_cache = {};           // { pos_printer_id: "image" | "text" }
odoo.pos_agent_main_mode = "image";    // modo del ticket principal


// --- COMANDOS ESC/POS (DISEÑO AVANZADO) ---
const CMD = {
    INIT:     '\x1B\x40',
    BOLD_ON:  '\x1B\x45\x01',
    BOLD_OFF: '\x1B\x45\x00',
    CENTER:   '\x1B\x61\x01',
    LEFT:     '\x1B\x61\x00',
    RIGHT:    '\x1B\x61\x02',
    SIZE_2X:  '\x1D\x21\x11', // Doble alto y ancho (Para número de orden)
    SIZE_H:   '\x1D\x21\x10', // Doble alto
    SIZE_N:   '\x1D\x21\x00', // Normal
    CUT:      '\x1D\x56\x42\x00'
};


// --- ESTILOS DE LOG ---
const STYLES = {
    title:    'font-weight: bold; font-size: 14px; color: #2c3e50; margin-top: 5px;',
    subtitle: 'font-weight: bold; color: #555;',
    success:  'background: #d4edda; color: #155724; padding: 2px 5px; border-radius: 3px; border: 1px solid #c3e6cb;',
    warning:  'background: #fff3cd; color: #856404; padding: 2px 5px; border-radius: 3px; border: 1px solid #ffeeba;',
    error:    'background: #f8d7da; color: #721c24; padding: 2px 5px; border-radius: 3px; border: 1px solid #f5c6cb;',
    info:     'background: #d1ecf1; color: #0c5460; padding: 2px 5px; border-radius: 3px; border: 1px solid #bee5eb;',
    data:     'color: #007bff; font-family: monospace;',
};


const logStep = (label, value, type = 'info') => {
    console.log(`%c🔹 ${label}: %c${value}`, STYLES.subtitle, STYLES[type]);
};


// =========================================================
// CARGADOR INTELIGENTE (OFFLINE -> ONLINE)
// =========================================================
const loadHtml2Canvas = async () => {
    if (window.html2canvas) return true;


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
        console.log(`📂 [LOADER] Buscando html2canvas local en /print_direct_odoo/...`);
        await loadScript(`/print_direct_odoo/static/lib/html2canvas.min.js`);
        console.log("✅ html2canvas cargado LOCALMENTE");
        return true;
    } catch (e) {
        console.warn("⚠️ Local falló, intentando CDN Online...");
        try {
            await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
            console.log("✅ html2canvas cargado desde CDN");
            return true;
        } catch (err) {
            console.error("❌ html2canvas NO SE PUDO CARGAR");
            return false;
        }
    }
};


// =========================================================
// UTILIDAD 1: FORMATEADOR DE COCINA (DISEÑO GRANDE)
// =========================================================
function formatKitchenTicket(input) {
    let output = CMD.INIT;
    const width = 42;
    const line = () => "-".repeat(width) + "\n";


    if (input && typeof input === 'object' && !input.tagName) {
        // --- CABECERA ---
        output += CMD.CENTER + CMD.BOLD_ON;
        output += _t("KITCHEN ORDER") + "\n" + CMD.BOLD_OFF;
        output += CMD.SIZE_N + `${_t("TIME")}: ${new Date().toLocaleTimeString()}\n`;
        output += CMD.LEFT + line();


        let tableName = "";
        if (input.order) {
             if (input.order.table_name) tableName = input.order.table_name;
             else if (input.order.table && input.order.table.name) tableName = input.order.table.name;
        }


        // --- LÓGICA DE NÚMERO DE ORDEN CORTO ---
        let shortOrder = "0000";
        let guestCount = "";
        if (input.order) {
            guestCount = input.order.guest_count || input.order.guestCount || input.order.tracking_number || "";
        }


        if (guestCount && guestCount !== '0') shortOrder = String(guestCount).padStart(5, '0');
        else {
             let rawName = (input.order && input.order.name) ? input.order.name : "";
             const numMatch = rawName.match(/(\d{4,6})/);
             shortOrder = numMatch ? numMatch[1] : (rawName.slice(-4) || "0000");
        }


        // --- IMPRESIÓN GIGANTE DEL NÚMERO ---
        output += CMD.CENTER + CMD.BOLD_ON;
        output += tableName + "\n";
        output += CMD.SIZE_2X + "#" + shortOrder + "\n";
        output += CMD.SIZE_N + CMD.BOLD_OFF;
        output += CMD.LEFT + line();


        const newItems = (input.changes && input.changes.new && input.changes.new.length > 0) ? input.changes.new : (input.raw_new || []);
        const cancelledItems = (input.changes && input.changes.cancelled && input.changes.cancelled.length > 0) ? input.changes.cancelled : (input.raw_cancelled || []);


        const printGroup = (items, title) => {
            if (!items || items.length === 0) return;
            output += CMD.BOLD_ON + `${title}:\n` + CMD.BOLD_OFF;
            items.forEach(item => {
                const qty = (item.qty || 1).toString();
                let name = _t("Product");
                if (item.name_wrapped) name = Array.isArray(item.name_wrapped) ? item.name_wrapped[0] : item.name_wrapped;
                else if (item.name) name = item.name;
                else if (item.product_name) name = item.product_name;


                name = name.replace(/[^\x20-\x7E]/g, '');


                output += CMD.BOLD_ON + `${qty.padEnd(5)} ` + CMD.BOLD_OFF + `${name}\n`;
                if (item.note) output += `     (${_t("Note")}: ${item.note})\n`;
            });
            output += "\n";
        };


        if (newItems.length > 0) printGroup(newItems, _t("NEW ITEMS"));
        if (cancelledItems.length > 0) printGroup(cancelledItems, _t("CANCELLED"));
    }


    // MODO TEXTO: SIN CUT, SIN ESPACIOS EXTRA
    return output.trim();
}


// =========================================================
// UTILIDAD 2: FORMATEADOR DE TICKET FINAL (DISEÑO LIMPIO)
// =========================================================
function formatFinalTicket(htmlElement) {
    if (!htmlElement) return "";


    const clone = htmlElement.cloneNode(true);
    clone.querySelectorAll('img, .pos-receipt-logo, .pos-receipt-header').forEach(el => el.remove());
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));


    let htmlContent = clone.innerHTML;
    htmlContent = htmlContent.replace(/<\/div>|<\/p>|<\/h[1-6]>/gi, '\n');


    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlContent;
    let rawText = tempDiv.textContent || tempDiv.innerText || "";


    // --- 1. NORMALIZACIÓN ---
    rawText = rawText.replace(/[ \t]{2,}/g, ' ');
    rawText = rawText.replace(/ÿ/g, "").replace(/\u00FF/g, "").replace(/\xA0/g, " ");


    // --- 2. ELIMINAR POWERED BY ODOO ---
    rawText = rawText.replace(/Powered\s+by\s+Odoo/gi, "");


    // --- 3. FORMATO ---
    rawText = rawText.replace(/(Order\s+[\w-]{5,})/gi, "\n$1\n");
    rawText = rawText.replace(/(\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2})/g, "\n$1\n");


    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.includes('undefined'));


    if (lines.length === 0) return "";


    let output = CMD.INIT + CMD.CENTER;
    const width = 42;
    const makeLine = () => "-".repeat(width) + "\n";


    const justify = (left, right) => {
        left = left.replace(/\.+$/, '');
        const s = Math.max(1, width - left.length - right.length);
        return left + " ".repeat(s) + right;
    };


    let inProducts = false;
    let pendingName = null;


    const regexTotal = /TOTAL|VAT|Tax|Amount|Cash|Change|Total|Totaal|Gesamt|Totale|Sum|Huf|Amt|Efectivo|Cambio|Troco|Rendu|Espèces|Bargeld|Contanti/i;
    const regexGuests = /(Guest|Table|Mesa|Invitados)/i;
    const regexPriceLine = /([^\d\s\w])?\s*([\d.,]+)\s*([^\d\s\w])?$/;


    for (let i = 0; i < lines.length; i++) {
        let lineText = lines[i];


        if (lineText.includes('/ Unit') || lineText.match(/Tax ID|VAT:/i)) continue;


        if (lineText.match(/^-+$/) || lineText.match(/_{3,}/)) {
            if (pendingName) { output += CMD.LEFT + pendingName + "\n"; pendingName = null; }
            output += CMD.LEFT + makeLine();
            continue;
        }


        // --- CABECERA ---
        if (regexGuests.test(lineText) && /\d{4,}/.test(lineText)) {
            const numMatch = lineText.match(/(\d{4,})$/);
            if (numMatch) {
                let prefix = lineText.replace(numMatch[0], '').replace(/,\s*Guests:?\s*$/i, '').trim();
                output += CMD.CENTER + CMD.BOLD_ON + prefix + "\n";
                output += CMD.SIZE_2X + numMatch[1] + "\n";
                output += CMD.SIZE_N + CMD.BOLD_OFF;
                output += CMD.LEFT + makeLine();
                continue;
            }
        }


        // --- TOTALES ---
        if (regexTotal.test(lineText)) {
            if (pendingName) { output += CMD.LEFT + pendingName + "\n"; pendingName = null; }
            const parts = lineText.match(/^(.*?)(\s*)([^\d\s\w]?\s*[\d.,]+\s*[^\d\s\w]?)$/);
            if (parts) {
                const label = parts[1].trim();
                const value = parts[3].trim();
                output += CMD.LEFT;
                if (label.toUpperCase().includes('TOTAL') || label.toUpperCase().includes('SUM')) {
                     output += CMD.BOLD_ON + CMD.SIZE_H + justify(label, value) + CMD.SIZE_N + CMD.BOLD_OFF + "\n";
                } else {
                     output += CMD.BOLD_ON + justify(label, value) + CMD.BOLD_OFF + "\n";
                }
            } else {
                output += CMD.CENTER + lineText + "\n";
            }
            continue;
        }


        // --- PRODUCTOS ---
        const priceMatch = lineText.match(regexPriceLine);
        const hasPrice = priceMatch && (priceMatch[2].length > 0 || priceMatch[0].length < 15);


        if (hasPrice) {
            if (!inProducts) { output += CMD.LEFT; inProducts = true; }
            const splitMatch = lineText.match(/^(.*?)(\s{2,}|\t|  )([^\d\s\w]?\s*[\d.,]+\s*[^\d\s\w]?)$/);
            let name = "";
            let price = "";


            if (splitMatch) {
                name = splitMatch[1];
                price = splitMatch[3];
            } else if (pendingName) {
                name = pendingName;
                price = lineText;
                pendingName = null;
            } else {
                 const lastSpaceIndex = lineText.search(/(\s)([^\d\s\w]?\s*[\d.,]+\s*[^\d\s\w]?)$/);
                 if (lastSpaceIndex > -1) {
                     name = lineText.substring(0, lastSpaceIndex);
                     price = lineText.substring(lastSpaceIndex).trim();
                 } else {
                     price = lineText;
                 }
            }


            if (name && price) {
                output += justify(name.trim(), price.trim()) + "\n";
            } else {
                output += justify("", lineText.trim()) + "\n";
            }
        } else {
            if (pendingName) output += CMD.LEFT + pendingName + "\n";
            if (inProducts) {
                pendingName = lineText;
            } else {
                output += CMD.CENTER + lineText + "\n";
            }
        }
    }


    if (pendingName) output += CMD.LEFT + pendingName + "\n";


    // MODO TEXTO: SIN CUT, SIN ESPACIOS EXTRA
    return output.trim();
}


// =========================================================
// 1. CLASE AGENTE (Envío de Impresión)
// =========================================================
class AgentPrinter extends BasePrinter {
    constructor(config) {
        super();
        this.config = config || {};
    }

    async sendPrintingJob(data, mode = "image") {
        console.group(`🖨️ [AGENT] NUEVO TRABAJO DE IMPRESIÓN`);

        let printerName = null;
        let detectionMethod = "Desconocido";
        let status = 'info';

        if (this.config && this.config.agent_printer_name) {
            printerName = this.config.agent_printer_name;
            detectionMethod = "Directa (Configuración Específica)";
            status = 'success';
        } else if (this.config && this.config.id && odoo.agent_printers_cache[this.config.id]) {
            printerName = odoo.agent_printers_cache[this.config.id];
            detectionMethod = "Caché Global (Mapeo por ID)";
            status = 'success';
        } else if (odoo.pos_agent_main_printer) {
            printerName = odoo.pos_agent_main_printer;
            detectionMethod = "Fallback (Usando Principal de Caja)";
            status = 'warning';
        } else {
            printerName = "Microsoft Print to PDF";
            detectionMethod = "❌ ERROR: Sin configuración (PDF Default)";
            status = 'error';
        }

        let rawType = mode;
        if (this.config && this.config.id && odoo.agent_modes_cache[this.config.id]) {
            rawType = odoo.agent_modes_cache[this.config.id];
        }
        if (mode === 'text' && rawType !== 'text') {
            if (data === CMD.CUT) rawType = 'text';
        }

        console.log("%c DATOS DEL ENVÍO ", "background: #333; color: #fff; padding: 2px 5px; border-radius: 3px;");
        logStep("Impresora Destino", printerName, status);
        logStep("Método de Detección", detectionMethod, 'info');
        logStep("Modo de Envío", rawType, 'info');
        logStep("URL del Agente", odoo.agent_url, 'data');

        const currentAgentUrl = `${odoo.agent_url}/print_raw`;
        let payloadData = data;

        if (rawType === 'text') {
            try {
                const textBytes = new Uint8Array([...data].map(c => c.charCodeAt(0)));
                payloadData = btoa(String.fromCharCode(...textBytes));
                logStep("Procesamiento", "Texto/Comandos codificados a Base64", 'info');
            } catch (e) {
                console.error("Error codificando texto:", e);
            }
        }

        try {
            const response = await fetch(currentAgentUrl, {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    printer_name: printerName,
                    raw_type: rawType,  
                    raw_data: payloadData,
                }),
            });

            if (response.ok) {
                console.log("%c ✅ ENVIADO AL AGENTE CON ÉXITO ", STYLES.success);
                console.groupEnd();
                return { successful: true };
            } else {
                console.log(`%c ❌ ERROR DEL SERVIDOR (Status: ${response.status}) `, STYLES.error);
                console.groupEnd();
                return { successful: false };
            }
        } catch (e) {
            console.log(`%c ❌ EXCEPCIÓN DE CONEXIÓN: ${e.message} `, STYLES.error);
            console.groupEnd();
            return { successful: false };
        }
    }

    async open_cashbox() {
        return { successful: true };
    }
}


// =========================================================
// 2. POS STORE (Carga Inicial y Configuración)
// =========================================================
patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        console.group("%c 🚀 [INIT] CONFIGURANDO SISTEMA DE IMPRESIÓN ", STYLES.title);

        const config = this.config || this.env.services.pos?.config;

        console.log("%c 1️⃣ DETECCIÓN DE URL (AGENTE) ", "color: #555; font-weight: bold; border-bottom: 1px solid #ccc;");
        let urlSource = "Default (localhost)";
        if (config && config.agent_url) {
            odoo.agent_url = config.agent_url.replace(/\/$/, "");
            urlSource = "📍 Configuración POS (Específica)";
            logStep("Estado", "URL encontrada en POS Config", 'success');
        } else {
            try {
                const globalUrl = await this.env.services.orm.call('ir.config_parameter', 'get_param', ['pos_printer.agent_url']);
                if (globalUrl) {
                    odoo.agent_url = globalUrl.replace(/\/$/, "");
                    urlSource = "🌐 Configuración Global";
                    logStep("Estado", "URL Global encontrada", 'success');
                }
            } catch (e) {}
        }
        console.log(`   🔗 URL ACTIVA: %c${odoo.agent_url}`, STYLES.data);

        if (config && config.agent_printer_name) {
            odoo.pos_agent_main_printer = config.agent_printer_name;
        }
        odoo.pos_agent_main_mode = (config && config.agent_main_mode) || "image";
        
        console.log("\n%c 2️⃣ IMPRESORA PRINCIPAL ", "color: #555; font-weight: bold; border-bottom: 1px solid #ccc;");
        logStep("Nombre", odoo.pos_agent_main_printer || "NO CONFIGURADA", odoo.pos_agent_main_printer ? 'success' : 'error');
        logStep("Modo Principal", odoo.pos_agent_main_mode, 'info');

        console.log("\n%c 3️⃣ IMPRESORAS DE COCINA ", "color: #555; font-weight: bold; border-bottom: 1px solid #ccc;");
        if (this.config.printer_ids && this.config.printer_ids.length > 0) {
            try {
                const printerIds = this.config.printer_ids.map(p => (typeof p === 'object' ? p.id : p));
                const printersData = await this.env.services.orm.call(
                    'pos.printer',
                    'search_read',
                    [[['id', 'in', printerIds]]],
                    { fields: ['name', 'agent_printer_name', 'agent_mode'] }
                );

                console.table(printersData.map(p => ({
                    'ID': p.id,
                    'Nombre': p.name,
                    'Windows': p.agent_printer_name,
                    'Modo': p.agent_mode || 'image'
                })));

                printersData.forEach(p => {
                    if (p.agent_printer_name) odoo.agent_printers_cache[p.id] = p.agent_printer_name;
                    odoo.agent_modes_cache[p.id] = p.agent_mode || "image";
                });
            } catch (err) {
                logStep("Error Carga", err.message, 'error');
            }
        }
        console.groupEnd();
    },

    async printChanges(order, orderChange, reprint = false, printers = this.unwatched.printers) {
        let targetPrinters = printers;
        if ((!targetPrinters || targetPrinters.length === 0) && this.config.printer_ids) {
            targetPrinters = this.config.printer_ids.map(id => ({
                config: { id: (typeof id === 'object' ? id.id : id), product_categories_ids: [] }
            }));
        }

        await loadHtml2Canvas();

        for (const printer of targetPrinters) {
            const pId = printer.config.id;
            const agentName = odoo.agent_printers_cache[pId];
            const agentMode = odoo.agent_modes_cache[pId] || 'image';

            if (agentName) {
                const changesList = Array.isArray(orderChange) ? orderChange : [orderChange];
                for (const change of changesList) {
                    
                    let receiptsData = [];
                    try {
                         const { orderData, changes } = this.generateOrderChange(order, change, printer.config.product_categories_ids || [], reprint);
                         receiptsData = await this.generateReceiptsDataToPrint(orderData, changes, change);
                    } catch (e) {
                         // Fallback si falla la generación interna
                         receiptsData = [{ 
                             changes: { 
                                 new: change.new || [], 
                                 cancelled: change.cancelled || [], 
                                 config_name: this.config.name,  
                                 employee_name: this.get_cashier().name,
                                 time: new Date().toLocaleTimeString(),
                                 table_name: order.table ? order.table.name : '',
                                 tracking_number: order.tracking_number
                             },
                             changedlines: change.new ? change.new : change.cancelled 
                         }];
                    }

                    for (const data of receiptsData) {
                        // --- PREPARACIÓN DE DATOS PARA ODOO 18 ---
                        let changedLines = [];
                        if (data.changes && data.changes.new) changedLines = changedLines.concat(data.changes.new);
                        if (data.changes && data.changes.cancelled) changedLines = changedLines.concat(data.changes.cancelled);
                        
                        if (changedLines.length === 0) {
                            if (data.raw_new) changedLines = changedLines.concat(data.raw_new);
                            if (data.raw_cancelled) changedLines = changedLines.concat(data.raw_cancelled);
                        }

                        data.changedlines = changedLines;

                        if (!data.changes) data.changes = {};
                        if (!data.changes.config_name) data.changes.config_name = this.config.name; 
                        if (!data.changes.employee_name) data.changes.employee_name = this.get_cashier().name; 
                        if (!data.changes.time) data.changes.time = new Date().toLocaleTimeString();
                        if (!data.changes.table_name && order.table) data.changes.table_name = order.table.name;
                        if (!data.changes.tracking_number) data.changes.tracking_number = order.tracking_number;


                        if (agentMode === 'text') {
                            console.log(`⚡ [COCINA] Formateando DATOS RAW a TEXTO PLANO para: ${agentName}`);
                            const plainText = formatKitchenTicket(data);
                            const tempPrinter = new AgentPrinter({ agent_printer_name: agentName, id: pId });
                            await tempPrinter.sendPrintingJob(plainText, 'text');
                        } else {
                            let receiptHtmlElement;
                            try {
                                receiptHtmlElement = renderToElement("point_of_sale.OrderChangeReceipt", {
                                    changes: data.changes,
                                    changedlines: data.changedlines,
                                    operational_title: data.operational_title || "",
                                    order: order,
                                    formatCurrency: (a) => this.env.utils.formatCurrency(a)
                                });
                            } catch (renderErr) {
                                console.error("❌ Falló renderizado QWeb (fallback activo):", renderErr);
                                const div = document.createElement('div');
                                div.innerHTML = `<h3>${_t("KITCHEN (Backup)")}</h3><pre>${formatKitchenTicket(data)}</pre>`;
                                receiptHtmlElement = div;
                            }
                            await this._printAsImageToAgent(receiptHtmlElement, agentName, pId);
                        }
                    }
                }
            }
        }
        return true;
    },

    async _printAsImageToAgent(htmlElement, printerName, printerId) {
        await loadHtml2Canvas();
        
        const container = document.createElement('div');
        container.classList.add('pos-receipt-print', 'pos-receipt');
        container.style.cssText = "position: fixed; top: 0; left: -9999px; width: 512px; background: #fff;";
        container.appendChild(htmlElement);
        document.body.appendChild(container);

        try {
            const canvas = await window.html2canvas(container, { scale: 2, useCORS: true, logging: false });
            const base64 = canvas.toDataURL('image/png').split(',')[1];
            
            const tempPrinter = new AgentPrinter({ agent_printer_name: printerName, id: printerId });
            await tempPrinter.sendPrintingJob(base64, 'image');
            
            // MODO IMAGEN: RESTAURAMOS CORTE PARA EVITAR QUE SE QUEDE PEGADO
            console.log("✂️ Enviando comando de corte tras imagen...");
            await tempPrinter.sendPrintingJob(CMD.CUT, 'text');

        } catch (e) {
            console.error("Error renderizando imagen cocina:", e);
        } finally {
            document.body.removeChild(container);
        }
    },

    create_printer(config) {
        return new AgentPrinter(config);
    },
});


// =========================================================
// 3. RECEIPT SCREEN (Ticket Final)
// =========================================================
patch(ReceiptScreen.prototype, {
    setup() {
        super.setup();

        const printToAgent = async () => {
            if (!odoo.pos_agent_main_printer) {
                logStep("Error", "Falta impresora principal", 'error');
                return false;
            }

            const mode = odoo.pos_agent_main_mode || "image";
            const receiptEl = document.querySelector('.pos-receipt');
            if (!receiptEl) return false;

            if (mode === 'text') {
                logStep("Modo Impresión", "TEXTO (Formato Inteligente)", 'info');
                const text = formatFinalTicket(receiptEl);
                const printer = new AgentPrinter({ agent_printer_name: odoo.pos_agent_main_printer });
                return (await printer.sendPrintingJob(text, 'text')).successful;
            } else {
                logStep("Modo Impresión", "IMAGEN (Canvas)", 'info');
                
                await loadHtml2Canvas();
                
                try {
                    const canvas = await window.html2canvas(receiptEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
                    const base64Raw = canvas.toDataURL('image/png').split(',')[1];
                    
                    const printer = new AgentPrinter({ agent_printer_name: odoo.pos_agent_main_printer });
                    
                    const result = await printer.sendPrintingJob(base64Raw, 'image');
                    
                    // MODO IMAGEN: RESTAURAMOS CORTE PARA EVITAR QUE SE QUEDE PEGADO
                    console.log("✂️ Enviando comando de corte tras imagen (Principal)...");
                    await printer.sendPrintingJob(CMD.CUT, 'text');

                    return result.successful;
                } catch(e) { return false; }
            }
        };

        this.doFullPrint = useAsyncLockedMethod(async () => {
            if (await printToAgent()) return;
            window.print();
        });

        this.doBasicPrint = useAsyncLockedMethod(async () => {
            if (await printToAgent()) return;
            window.print();
        });
    },
});
