# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request
import logging

_logger = logging.getLogger(__name__)

class ZplDirectController(http.Controller):
    @http.route('/web/print_zpl_direct', type='http', auth='user', cors='*')
    def print_zpl_direct(self, model, active_ids, layout='normal', **kw):
        """
        Genera etiquetas ZPL puras para enviarlas al Agente local.
        layout='price' -> Con precio
        layout='normal' -> Sin precio
        """
        try:
            # Convertir IDs de string a lista de enteros
            ids = [int(x) for x in active_ids.split(',')]
            records = request.env[model].browse(ids)
            
            full_zpl = ""
            
            for rec in records:
                # 1. Obtener Datos
                name = rec.display_name or "Producto"
                # Limpiar caracteres peligrosos para ZPL
                name = name.replace("_", " ").replace("^", "").replace("~", "")
                
                barcode = rec.barcode or rec.default_code or ""
                
                # Precio (solo si existe campo list_price)
                price_val = rec.list_price if hasattr(rec, 'list_price') else 0.0
                price_str = f"{price_val:.2f}" 
                
                # 2. DEFINIR PLANTILLAS
                if layout == 'price':
                    # --- DISEÑO CON PRECIO ---
                    label = f"""
^XA
^CI28
^FO40,40^A0N,40,30^FD{name[:35]}^FS
^FO40,100^BCN,90,Y,N,N^FD{barcode}^FS
^FO40,230^A0N,30,30^FDPrecio: {price_str}^FS
^XZ
"""
                else:
                    # --- DISEÑO NORMAL (SIN PRECIO) ---
                    label = f"""
^XA
^CI28
^FO40,40^A0N,40,30^FD{name[:35]}^FS
^FO40,100^BCN,90,Y,N,N^FD{barcode}^FS
^XZ
"""
                full_zpl += label

            return request.make_response(full_zpl, headers=[
                ('Content-Type', 'text/plain'),
                ('Content-Disposition', 'inline; filename=labels.zpl')
            ])
            
        except Exception as e:
            _logger.exception("Error generando ZPL Directo")
            return request.make_response(f"ERROR: {str(e)}", status=500)
