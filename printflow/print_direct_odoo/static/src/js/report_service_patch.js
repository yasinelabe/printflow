/** @odoo-module */
import { registry } from "@web/core/registry";

console.log(">> [V_FINAL_HTTPS] Print Agent: Listo (Versión Corregida)");

const printAgentHandler = async (action, options, env) => {
    if (action.type !== 'ir.actions.report') return false;

    // =========================================================
    // 1. OBTENER URL CONFIGURADA (Dinámica)
    // =========================================================
    let agentBase = "https://localhost:5000"; // Valor por defecto
    try {
        const configUrl = await env.services.orm.call('ir.config_parameter', 'get_param', ['pos_printer.agent_url']);
        if (configUrl) {
            agentBase = configUrl.replace(/\/$/, ""); // Eliminar barra final si existe
        }
    } catch (e) {
        console.warn("⚠️ No se pudo cargar la URL del agente, usando localhost.", e);
    }
    
    // Construimos las URLs dinámicas
    const AGENT_URL = `${agentBase}/print_raw`;
    const AGENT_CHECK_URL = `${agentBase}/get_printers`;

    // =========================================================
    // 2. BUSCAR IMPRESORA
    // =========================================================
    let printerName = action.agent_printer_name;

    if (!printerName) {
        console.log(">> [RECUPERACIÓN] Buscando impresora...");
        try {
            if (action.xml_id) {
                // Búsqueda por XML_ID
                const res = await env.services.orm.call("ir.actions.report", "search_read", 
                    [[['xml_id', '=', action.xml_id]]], { fields: ['agent_printer_name'], limit: 1 });
                if (res && res[0]) printerName = res[0].agent_printer_name;
            }
            else if (action.report_name) {
                // Búsqueda por nombre técnico
                const res = await env.services.orm.call("ir.actions.report", "search_read", 
                    [[['report_name', '=', action.report_name]]], { fields: ['agent_printer_name'], limit: 1 });
                if (res && res[0]) printerName = res[0].agent_printer_name;
            }
        } catch (e) { console.error(e); }
    }

    if (!printerName) {
        // Si no hay impresora configurada, dejamos que Odoo haga lo suyo (descarga normal)
        return false;
    }

    console.log(`>> [ÉXITO] Destino: ${agentBase} -> Impresora: ${printerName}`);

    // =========================================================
    // 3. LOGICA ZPL (NUEVA - Traída de Odoo 19)
    // =========================================================
    // Detectamos si la acción trae datos del wizard de etiquetas (Stock)
    if (action.data && action.data.active_model) {
        console.log(">> 🧠 Datos del Wizard detectados en action.data:", action.data);

        // 3.1 Obtener IDs de los productos
        const qtyDict = action.data.quantity_by_product || {};
        const docIds = Object.keys(qtyDict).map(id => parseInt(id));
        
        if (docIds.length === 0) {
            console.warn(">> No hay IDs de productos en el wizard.");
            return false;
        }

        // 3.2 Detectar Diseño (Con precio o Normal)
        let layoutType = 'normal';
        if (action.data.price_included === true) {
            layoutType = 'price';
        } else if (action.data.zpl_template && action.data.zpl_template.includes('price')) {
            layoutType = 'price';
        } else if (action.data.zpl_template && action.data.zpl_template.includes('dymo')) {
            layoutType = 'dymo';
        }
        
        console.log(`>> 🎨 Diseño ZPL detectado: ${layoutType}`);

        // 3.3 Llamar al Controlador
        const activeModel = action.data.active_model; 
        const url = `/web/print_zpl_direct?model=${activeModel}&active_ids=${docIds.join(',')}&layout=${layoutType}`;

        try {
            console.log(`>> Solicitando ZPL a: ${url}`);
            const res = await fetch(url);
            
            if (!res.ok) {
                const txt = await res.text();
                alert("Error generando ZPL en backend:\n" + txt);
                return true; 
            }

            const zplText = await res.text();
            
            // 3.4 Enviar al Agente Local
            // [CORRECCIÓN 1]: Codificación segura UTF-8 para evitar crash con tildes/Ñ
            const base64Zpl = window.btoa(unescape(encodeURIComponent(zplText)));

            fetch(AGENT_URL, {
                method: "POST",
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    printer_name: printerName,
                    raw_data: base64Zpl,
                    raw_type: 'zpl' // IMPORTANTE: Le dice al agente que es código crudo
                })
            }).then(() => {
                console.log(">> ✅ ZPL Enviado exitosamente al agente");
            }).catch(err => {
                console.error(">> ❌ Error enviando ZPL:", err);
                alert(`❌ Error enviando a impresora ZPL.\nRevise que el agente esté corriendo en ${agentBase}`);
            });
            
            return true; // Detenemos el proceso aquí, ya se mandó a imprimir
            
        } catch (e) {
            console.error(">> Excepción en flujo ZPL:", e);
            alert("Error crítico generando ZPL: " + e.message);
            return true;
        }
    }

    // =========================================================
    // 4. MODO REPORTE STANDARD (PDF)
    // =========================================================
    // Si no entró en el if anterior, es un reporte normal (Factura, Pedido, etc.)
    
    // --- Obtener IDs ---
    let docIds = (options && options.active_ids) || (action.context && action.context.active_ids) || [];
    if (docIds.length === 0 && action.context.active_id) docIds = [action.context.active_id];
    if (docIds.length === 0 && options && options.res_id) docIds = [options.res_id];

    if (docIds.length === 0) return false;

    console.log(">> 📄 MODO REPORTE STANDARD (PDF)");

    // --- URL FIX: Usar report_name en vez de ID ---
    const url = `/report/pdf/${action.report_name}/${docIds.join(",")}`;
    
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.error("Error descargando PDF (Status " + res.status + ")");
            return false; // Dejamos que Odoo maneje el error
        }

        const blob = await res.blob();
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            
            // Enviar al Agente con la URL dinámica
            fetch(AGENT_URL, {
                method: "POST", 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    printer_name: printerName, 
                    raw_data: base64,
                    // [CORRECCIÓN 2]: Enviar tipo explícito para evitar impresión basura
                    raw_type: 'pdf' 
                })
            }).then(() => {
                console.log(">> 🖨️ PDF enviado al agente");
            }).catch(err => {
                console.error(">> Error HTTPS:", err);
                alert(`❌ Error de conexión con Agente.\n\n1. Asegúrate que el programa verde está abierto en el PC (${agentBase}).\n2. Abre ${AGENT_CHECK_URL} en una pestaña nueva y acepta el certificado de seguridad.`);
            });
        };
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
};

// Registrar el handler con prioridad
registry.category("ir.actions.report handlers").add("print_agent_handler_https", printAgentHandler, { sequence: 1 });
