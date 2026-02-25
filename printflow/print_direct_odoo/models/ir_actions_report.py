from odoo import models, fields, api

class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    agent_printer_name = fields.Char(
        string="Agent Printer Name",  
        help="Exact name of the printer in Windows/Mac for direct printing."  
    )

    def _get_readable_fields(self):
        """
        OBLIGATORIO EN ODOO 18:
        Permite que 'agent_printer_name' sea visible en el Javascript (Point of Sale).
        Sin esto, el campo no viaja al frontend.
        """
        return super()._get_readable_fields() | {'agent_printer_name'}