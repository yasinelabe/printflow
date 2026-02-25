from odoo import models, fields


class PosPrinter(models.Model):
    _inherit = 'pos.printer'

    # Nombre de la impresora en el agente local (para impresoras secundarias/orden de cocina)
    agent_printer_name = fields.Char(
        string="Agent Printer Name",
        help="Exact name of the printer on the OS running the local agent."
    )

    # Nuevo: modo de envío al agente (imagen o texto)
    agent_mode = fields.Selection(
        [
            ('image', 'Image (Graphic Ticket)'),
            ('text', 'Text Only (Dot-matrix / Text Driver)'),
        ],
        string="Agent Print Mode",
        default='image',
        help="Choose how this printer receives jobs from the agent."
    )


class PosConfig(models.Model):
    _inherit = 'pos.config'

    # Impresora principal del TPV
    agent_printer_name = fields.Char(
        string="Main Printer Name (Agent)",
        help="Default printer for POS receipts."
    )

    # URL específica por Punto de Venta
    agent_url = fields.Char(
        string="Agent URL (Local)",
        help="URL específica para este POS (e.g. https://192.168.1.50:5000). "
             "If empty, the global configuration will be used.",
        default=""
    )

    # Nuevo: modo para el ticket principal
    agent_main_mode = fields.Selection(
        [
            ('image', 'Image (Graphic Ticket)'),
            ('text', 'Text Only (Dot-matrix / Text Driver)'),
        ],
        string="Main Receipt Mode",
        default='image',
        help="How the main POS receipt is sent to the agent."
    )


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    # Campo relacionado para configurar la impresora principal desde Ajustes
    pos_agent_printer_name = fields.Char(
        related='pos_config_id.agent_printer_name',
        readonly=False,
        string="Agent Printer Name (Main)"
    )

    # Campo relacionado para la URL específica
    pos_agent_url = fields.Char(
        related='pos_config_id.agent_url',
        readonly=False,
        string="Agent URL (Specific for this POS)"
    )

    # Campo relacionado para el modo principal
    pos_agent_main_mode = fields.Selection(
        related='pos_config_id.agent_main_mode',
        readonly=False,
        string="Main Receipt Mode"
    )


class PosSession(models.Model):
    _inherit = 'pos.session'

    def _loader_params_pos_printer(self):
        result = super(PosSession, self)._loader_params_pos_printer()
        result['search_params']['fields'].append('agent_printer_name')
        result['search_params']['fields'].append('agent_mode')
        return result

    def _loader_params_pos_config(self):
        res = super()._loader_params_pos_config()
        # Aseguramos que estos campos llegan al POS
        fields_list = res.get('search_params', {}).setdefault('fields', [])
        for fname in ['agent_printer_name', 'agent_url', 'agent_main_mode']:
            if fname not in fields_list:
                fields_list.append(fname)
        return res
