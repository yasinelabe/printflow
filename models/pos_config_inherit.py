# -*- coding: utf-8 -*-
# Copyright 2024 Yasin Elabe
# License OPL-1

from odoo import api, fields, models


class PosConfigPrintFlow(models.Model):
    """Extend POS configuration with PrintFlow settings for direct printing."""
    _inherit = 'pos.config'

    pf_enable_direct_print = fields.Boolean(
        string="Enable PrintFlow",
        default=False,
        help="Enable direct printing via PrintFlow Desktop Agent for this POS terminal.",
    )

    pf_server_address = fields.Char(
        string="Local Print Server",
        help="Override the global PrintFlow server for this specific terminal. "
             "Leave empty to use the system default.\n"
             "Example: https://192.168.1.50:5000",
    )

    pf_receipt_printer = fields.Char(
        string="Receipt Printer Name",
        help="The exact printer name as shown in PrintFlow Desktop Agent. "
             "This printer will be used for customer receipts.",
    )

    pf_output_format = fields.Selection(
        selection=[
            ('graphic', 'Graphic Mode (Rendered Image)'),
            ('graphic_cut', 'Graphic Mode + Auto Cut'),
            ('raw', 'Raw Text Mode (ESC/POS)'),
        ],
        string="Output Format",
        default='graphic_cut',
        help="Graphic Mode: Renders receipt as high-quality image\n"
             "Raw Mode: Sends formatted text commands (faster, less formatting)",
    )

    def _load_pos_data(self, data):
        """Override to include PrintFlow fields in POS data."""
        result = super()._load_pos_data(data)
        # Add PrintFlow fields to the data
        if result.get('data'):
            for record in result['data']:
                config = self.browse(record['id'])
                record['pf_enable_direct_print'] = config.pf_enable_direct_print
                record['pf_server_address'] = config.pf_server_address or ''
                record['pf_receipt_printer'] = config.pf_receipt_printer or ''
                record['pf_output_format'] = config.pf_output_format or 'graphic_cut'
        return result

    def get_printflow_endpoint(self):
        """Get the effective PrintFlow server URL for this POS config."""
        self.ensure_one()
        if self.pf_server_address:
            return self.pf_server_address.rstrip('/')
        return self.env['ir.config_parameter'].sudo().get_param(
            'printflow.server_url', 'https://localhost:5000'
        ).rstrip('/')
