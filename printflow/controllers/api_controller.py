# -*- coding: utf-8 -*-
# Copyright 2024 Yasin Elabe
# License OPL-1

from odoo import http
from odoo.http import request
import json
import logging

_logger = logging.getLogger(__name__)


class PrintFlowController(http.Controller):
    """API endpoints for PrintFlow functionality."""
    
    @http.route('/printflow/config', type='json', auth='user', methods=['POST'])
    def get_configuration(self):
        """Return PrintFlow configuration for the current user's context."""
        config_params = request.env['ir.config_parameter'].sudo()
        
        return {
            'server_url': config_params.get_param('printflow.server_url', 'https://localhost:5000'),
            'active': config_params.get_param('printflow.active', 'True') == 'True',
        }
    
    @http.route('/printflow/log', type='json', auth='user', methods=['POST'])
    def log_print_job(self, **kwargs):
        """Record a print job in the history."""
        try:
            history_model = request.env['printflow.history'].sudo()
            history_model.log_print_job(
                printer=kwargs.get('printer', 'Unknown'),
                doc_model=kwargs.get('document_model'),
                doc_name=kwargs.get('document_name'),
                output_format=kwargs.get('format'),
                status=kwargs.get('status', 'queued'),
                size=kwargs.get('size', 0),
                error=kwargs.get('error'),
                pos_config=kwargs.get('pos_config_id'),
            )
            return {'success': True}
        except Exception as e:
            _logger.exception("Failed to log print job")
            return {'success': False, 'error': str(e)}
    
    @http.route('/printflow/printers', type='json', auth='user', methods=['POST'])
    def get_configured_printers(self):
        """Return all configured PrintFlow printers."""
        printers = []
        
        # Get POS receipt printers
        pos_configs = request.env['pos.config'].search([
            ('pf_receipt_printer', '!=', False)
        ])
        for config in pos_configs:
            printers.append({
                'name': config.pf_receipt_printer,
                'type': 'pos_receipt',
                'source': config.name,
            })
        
        # Get kitchen/preparation printers
        kitchen_printers = request.env['pos.printer'].search([
            ('pf_target_printer', '!=', False)
        ])
        for printer in kitchen_printers:
            printers.append({
                'name': printer.pf_target_printer,
                'type': 'kitchen',
                'source': printer.name,
            })
        
        # Get report printers
        reports = request.env['ir.actions.report'].search([
            ('pf_printer_name', '!=', False)
        ])
        for report in reports:
            printers.append({
                'name': report.pf_printer_name,
                'type': 'report',
                'source': report.name,
            })
        
        # Remove duplicates
        seen = set()
        unique_printers = []
        for p in printers:
            if p['name'] not in seen:
                seen.add(p['name'])
                unique_printers.append(p)
        
        return unique_printers
