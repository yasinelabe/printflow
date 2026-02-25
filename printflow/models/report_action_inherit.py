# -*- coding: utf-8 -*-
# Copyright 2024 Yasin Elabe
# License OPL-1

from odoo import fields, models


class ReportActionPrintFlow(models.Model):
    """Extend report actions with PrintFlow direct printing configuration."""
    _inherit = 'ir.actions.report'

    pf_printer_name = fields.Char(
        string="Direct Print Destination",
        help="When specified, clicking print will send directly to this printer "
             "instead of showing the browser print dialog.\n"
             "Use the exact printer name from PrintFlow Desktop Agent.",
    )

    pf_copies = fields.Integer(
        string="Auto-Print Copies",
        default=1,
        help="Number of copies to print automatically when using direct print.",
    )

    def _get_readable_fields(self):
        """Expose PrintFlow fields to JavaScript client."""
        readable = super()._get_readable_fields()
        readable.update({
            'pf_printer_name',
            'pf_copies',
        })
        return readable
