const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

Gtk.init(null, 0);

const ICO_UNKNOWN = '0';
const ICO_CONNECTED_INACTIVE = '1';
const ICO_DISCONNECTED_INACTIVE_URI = '2';
const ICO_ABOUT_EXPIRE = '3';
const ICO_DISCONNECTACTIVE = '4';
const ICO_DOWNLOADING = '5';
const ICO_PERMANENT = '6';
const ICO_PROTECTED = '7';
const ICO_UPGRADING = '8';

function icon(ico_id) {
    const iconFolder = './icon/';
    const logos = ['LogoUnknown_s.png', 'LogoInctive_s.png', 'LogoDisconnectedInactive_s.png', 
                   'LogoAbouttoExpire_s.png', 'LogoDisconnectedActive_s.png', 'LogoDownload_s.png',
                   'LogoPermanent_s.png', 'LogoProtected_s.png', 'LogoInstall_s.png'];

    return iconFolder + (logos[ico_id] || logos[ICO_UNKNOWN]);
}

function reload() {
    const TD_CLIENT_APP = '/opt/TheftDeterrentclient/client/Theft_Deterrent_client.autorun'

    StatusIcon.set_from_file(icon(ICO_UNKNOWN));

    let app_info = Gio.app_info_create_from_commandline(TD_CLIENT_APP, null, 0, null);
    let sucessful_launch = app_info.launch([], null, null);

    if(sucessful_launch) {
        TDClient.GetInfoRemote('', refreshIcon);
        TDClient.GetMenuItemInfoRemote('', refreshMenu);
    }
}

let Menu = new Gtk.Menu();

function refreshMenu(data) {
    if(data == null) {
        reload();
        return;
    }

    const menu_data = data[0];
    const new_menu = new Gtk.Menu();

    Object.keys(menu_data).forEach(keyname => {
        const menu_item = new Gtk.MenuItem({ label: menu_data[keyname] });

        menu_item.connect('activate', () => TDClient.OnMenuItemClickRemote(keyname));

        new_menu.append(menu_item);
    });

    new_menu.show_all();

    Menu = new_menu;
}

const StatusIcon = Gtk.StatusIcon.new_from_file(icon(ICO_UNKNOWN));

function refreshIcon(data) {
    if (data == null) {
        reload();
        return;
    }

    const ico_id = data[0]['id'];
    StatusIcon.set_from_file(icon(ico_id));
}

function TDInfoChanged(proxy, sender, msg) {
    refreshIcon(msg);
}

const TDIface = '<node> \
<interface name="com.intel.cmpc.td.client"> \
    <method name="GetInfo"> \
        <arg direction="out"  type="a{ss}" /> \
        <arg direction="in" type="s" /> \
    </method> \
    <method name="OnMenuItemClick"> \
        <arg direction="in" type="s" /> \
    </method> \
    <method name="GetMenuItemInfo"> \
        <arg direction="in" type="s" /> \
        <arg direction="out" type="a{ss}" /> \
    </method> \
    <signal name="TDInfoChanged"> \
        <arg direction="out" type="a{ss}" /> \
    </signal> \
</interface> \
</node>';

//Create the remote object, based on the correct parh and bus name
const TDProxy = Gio.DBusProxy.makeProxyWrapper(TDIface);
const TDClient = new TDProxy(Gio.DBus.session,
                             'com.intel.cmpc.td.client',
                             '/com/intel/cmpc/td/client');

//Set the delegate to the TDInfoChanged Event
TDClient.connectSignal('TDInfoChanged', TDInfoChanged);

//Load initial data
TDClient.GetInfoRemote('', refreshIcon);
TDClient.GetMenuItemInfoRemote('', refreshMenu);

//StatusIcon menu
StatusIcon.connect('popup-menu', function popup_menu(icon, button, time) {
    Menu.popup(null, null, null, button, time);
});

Gtk.main();
