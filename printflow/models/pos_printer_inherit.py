# -*- coding: utf-8 -*-
# Copyright 2024 Yasin Elabe
# License OPL-1

from odoo import api, fields, models


class PosPrinterPrintFlow(models.Model):
    """Extend POS Order/Kitchen Printers with PrintFlow settings."""
    _inherit = 'pos.printer'

    pf_target_printer = fields.Char(
        string="PrintFlow Printer",
        help="The printer name as displayed in PrintFlow Desktop Agent. "
             "Orders matching this printer's categories will be sent here.",
    )

    pf_ticket_format = fields.Selection(
        selection=[
            ('graphic', 'Graphic (Image)'),
            ('graphic_cut', 'Graphic + Cut'),
            ('raw', 'Text Only (ESC/POS)'),
        ],
        string="Ticket Format",
        default='graphic_cut',
        help="Graphic: Renders order ticket as image (better formatting)\n"
             "Text: Sends raw ESC/POS commands (faster printing)",
    )

    @api.model
    def _load_pos_data_fields(self, config_id):
        """Include PrintFlow fields when loading printer data for POS."""
        result = super()._load_pos_data_fields(config_id)
        # Ensure result is a list before extending
        if isinstance(result, list):
            result.extend(['pf_target_printer', 'pf_ticket_format'])
        return result
