from odoo import fields, models

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_print_agent_url = fields.Char(
        string="Print Agent URL",  
        help="Full address of the print agent (e.g., https://192.168.1.50:5000)", 
        config_parameter='pos_printer.agent_url',
        default="https://localhost:5000"
    )

    def action_open_print_reports(self):
        """ Abre la vista de Reportes (ir.actions.report) para configurar impresoras """
        return {
            'name': 'Configure Printing Reports', 
            'type': 'ir.actions.act_window',
            'res_model': 'ir.actions.report',
            'view_mode': 'list,form',
            'domain': [], 
            'context': {},
            'target': 'current',
        }