Ext.define('Redwood.view.ALMSettings', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.almSettings',
    bodyPadding: 10,
    minHeight: 150,
    manageHeight: true,
    requiredText: '<span style="color:red;font-weight:bold" data-qtip="Required">*</span>',

    initComponent: function () {

        var me = this;

        this.items = [
            {
                xtype: 'form',
                defaultType: 'textfield',
                layout:"anchor",
                bodyPadding: 5,
                buttonAlign:"left",
                width: 460,
                defaults: {
                    width: 450
                },
                items: [
                    {
                        xtype: "textfield",
                        fieldLabel: "Server",
                        afterLabelTextTpl: me.requiredText,
                        name: "almserver",
                        itemId: "almserver",
                        emptyText: "ALM server URL",
                        allowBlank:false
                    },
					{
                        xtype: "textfield",
                        fieldLabel: "Domain",
                        afterLabelTextTpl: me.requiredText,
                        name: "almdomain",
                        itemId: "almdomain",
                        emptyText: "ALM domain",
                        allowBlank:false
                    },
					{
                        xtype: "textfield",
                        fieldLabel: "Project",
                        afterLabelTextTpl: me.requiredText,
                        name: "almproject",
                        itemId: "almproject",
                        emptyText: "ALM project",
                        allowBlank:false
                    },
                    {
                        xtype: "textfield",
                        fieldLabel: "User Name",
						afterLabelTextTpl: me.requiredText,
                        name: "almuser",
                        itemId: "almuser"
                        //emptyText: "Optional- needed only if authentication is required."
                    },
                    {
                        xtype: "textfield",
                        fieldLabel: "Password",
						afterLabelTextTpl: me.requiredText,
                        name: "almpassword",
                        itemId: "almpassword",
                        inputType: 'password'
                        //emptyText: "Optional- needed only if authentication is required."
                    }
                ],
                buttons:[
                    {
                        text: 'Save Settings',
                        itemId: "submit",
                        formBind: true,
                        handler: function(){
                            me.fireEvent("setALMSettings",me.down("form").form.getFieldValues())
                        }
                    }
                ]
            }

        ];

        this.callParent(arguments);
    },
    loadData: function(data){
        this.down("#almserver").setValue(data.almserver);
		this.down("#almdomain").setValue(data.almdomain);
		this.down("#almproject").setValue(data.almproject);
        this.down("#almuser").setValue(data.almuser);
        this.down("#almpassword").setValue(data.almpassword);
    }
});