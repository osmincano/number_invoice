function pos_invoice_number(instance, module){
    var QWeb = instance.web.qweb;
	var _t = instance.web._t;

    var PosModelSuper = module.PosModel;
    module.PosModel = module.PosModel.extend({

        push_and_invoice_order: function(order){
//             override to remove auto pdf generation
            var self = this;
            var invoiced = new $.Deferred();

            if(!order.get_client()){
                invoiced.reject('error-no-client');
                return invoiced;
            }

            var order_id = this.db.add_order(order.export_as_JSON());

            this.flush_mutex.exec(function(){
                var done = new $.Deferred(); // holds the mutex

                // send the order to the server
                // we have a 30 seconds timeout on this push.
                // FIXME: if the server takes more than 30 seconds to accept the order,
                // the client will believe it wasn't successfully sent, and very bad
                // things will happen as a duplicate will be sent next time
                // so we must make sure the server detects and ignores duplicated orders

                var transfer = self._flush_orders([self.db.get_order(order_id)], {timeout:30000, to_invoice:true});

                transfer.fail(function(){
                    invoiced.reject('error-transfer');
                    done.reject();
                });

                // on success, get the order id generated by the server
                transfer.pipe(function(order_server_id){
                    // removed auto generating pdf file
                    invoiced.resolve();
                    done.resolve();
                });

                return done;

            });

            return invoiced;
        },

    });

    var ReceiptScreenWidgetSuper = module.ReceiptScreenWidget;
    module.ReceiptScreenWidget = module.ReceiptScreenWidget.extend({

        refresh: function() {
//             Added invoice number to order line using rpc call
            var order = this.pos.get('selectedOrder');
            var invoice_number = null;
            var uuid = null;
            self = this;
            var pos_order_model = new instance.web.Model('pos.order');
            pos_order_model.query(['name'])
                .filter([['pos_reference', '=', order.attributes.name]])
                .limit(1)
                .all().then(function (order_name) {
                    console.log('order_name', order_name[0]['name'])
                    var invoice_model = new instance.web.Model('account.invoice');
                    invoice_model.query(['uuid', 'origin'])
                        .filter([['origin', '=', order_name[0]['name']]])
                        .limit(1)
                        .all().then(function (invoice_number) {
                        console.log('all fields defined in query', invoice_number)
                        invoice_number = invoice_number[0]['uuid']
                        $('.pos-receipt-container', self.$el).html(QWeb.render('PosTicket',{
                            widget:self,
                            order: order,
                            invoice_number: invoice_number,
                            orderlines: order.get('orderLines').models,
                            paymentlines: order.get('paymentLines').models,
                        }));
                    });
            });
        },

    });

    var PaymentScreenWidgetSuper = module.PaymentScreenWidget;
    module.PaymentScreenWidget = module.PaymentScreenWidget.extend({
        validate_order: function(options) {
//            validation with invoice button returns to pos ticket
            var self = this;
            options = options || {};

            var currentOrder = this.pos.get('selectedOrder');

            if(currentOrder.get('orderLines').models.length === 0){
                this.pos_widget.screen_selector.show_popup('error',{
                    'message': _t('Empty Order'),
                    'comment': _t('There must be at least one product in your order before it can be validated'),
                });
                return;
            }

            var plines = currentOrder.get('paymentLines').models;
            for (var i = 0; i < plines.length; i++) {
                if (plines[i].get_type() === 'bank' && plines[i].get_amount() < 0) {
                    this.pos_widget.screen_selector.show_popup('error',{
                        'message': _t('Negative Bank Payment'),
                        'comment': _t('You cannot have a negative amount in a Bank payment. Use a cash payment method to return money to the customer.'),
                    });
                    return;
                }
            }

            if(!this.is_paid()){
                return;
            }

            // The exact amount must be paid if there is no cash payment method defined.
            if (Math.abs(currentOrder.getTotalTaxIncluded() - currentOrder.getPaidTotal()) > 0.00001) {
                var cash = false;
                for (var i = 0; i < this.pos.cashregisters.length; i++) {
                    cash = cash || (this.pos.cashregisters[i].journal.type === 'cash');
                }
                if (!cash) {
                    this.pos_widget.screen_selector.show_popup('error',{
                        message: _t('Cannot return change without a cash payment method'),
                        comment: _t('There is no cash payment method available in this point of sale to handle the change.\n\n Please pay the exact amount or add a cash payment method in the point of sale configuration'),
                    });
                    return;
                }
            }

            if (this.pos.config.iface_cashdrawer) {
                    this.pos.proxy.open_cashbox();
            }

            if(options.invoice){
                // deactivate the validation button while we try to send the order
                this.pos_widget.action_bar.set_button_disabled('validation',true);
                this.pos_widget.action_bar.set_button_disabled('invoice',true);

                var invoiced = this.pos.push_and_invoice_order(currentOrder);

                invoiced.fail(function(error){
                    if(error === 'error-no-client'){
                        self.pos_widget.screen_selector.show_popup('error',{
                            message: _t('An anonymous order cannot be invoiced'),
                            comment: _t('Please select a client for this order. This can be done by clicking the order tab'),
                        });
                    }else{
                        self.pos_widget.screen_selector.show_popup('error',{
                            message: _t('The order could not be sent'),
                            comment: _t('Check your internet connection and try again.'),
                        });
                    }
                    self.pos_widget.action_bar.set_button_disabled('validation',false);
                    self.pos_widget.action_bar.set_button_disabled('invoice',false);
                });

                invoiced.done(function(){
                    self.pos_widget.action_bar.set_button_disabled('validation',false);
                    self.pos_widget.action_bar.set_button_disabled('invoice',false);
                    self.pos.push_order(currentOrder);
                    self.pos_widget.screen_selector.set_current_screen(self.next_screen);
                });

            }else{
                this.pos.push_order(currentOrder)
                if(this.pos.config.iface_print_via_proxy){
                    var receipt = currentOrder.export_for_printing();
                    this.pos.proxy.print_receipt(QWeb.render('XmlReceipt',{
                        receipt: receipt, widget: self,
                    }));
                    this.pos.get('selectedOrder').destroy();    //finish order and go back to scan screen
                }else{
                    this.pos_widget.screen_selector.set_current_screen(this.next_screen);
                }
            }

            // hide onscreen (iOS) keyboard
            setTimeout(function(){
                document.activeElement.blur();
                $("input").blur();
            },250);
        },
    });
}

(function(){
    var _super = window.openerp.point_of_sale;
    window.openerp.point_of_sale = function(instance){
        _super(instance);
        var module = instance.point_of_sale;

        pos_invoice_number(instance, module);
    };
})();