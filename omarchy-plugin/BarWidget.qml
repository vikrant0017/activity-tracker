import QtQuick
import Quickshell.Io
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "vikrant.activity-tracker"

  property string activeTime: "XX:XX"
  property var topApps: []

  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function injectPanel() {
    var panel = panelLoader.item
    if (!panel) return
    if ("bar" in panel) panel.bar = root.bar
    if ("settings" in panel) panel.settings = root.settings
    if ("anchorItem" in panel) panel.anchorItem = button
    if ("hostWidget" in panel) panel.hostWidget = root
    if ("activeTime" in panel) panel.activeTime = root.activeTime
    if ("topApps" in panel) panel.topApps = root.topApps
  }

  function refresh() {
    if (!statsProcess.running) statsProcess.running = true
  }

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function togglePanel() {
    if (panelLoader.item) panelLoader.item.toggle()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function applyStats(raw) {
    try {
      var stats = JSON.parse(raw)
      activeTime = stats.active_time || "XX:XX"
      topApps = stats.top_apps || []
      injectPanel()
    } catch (error) {
      activeTime = "XX:XX"
      topApps = []
      injectPanel()
    }
  }

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  Process {
    id: statsProcess
    // A successful response is also the backend availability check. When the
    // dashboard daemon starts, the next poll activates the live widget data.
    command: ["curl", "--fail", "--silent", "--max-time", "2", "http://127.0.0.1:8765/api/bar-stats"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.applyStats(text)
    }
    Component.onCompleted: running = true
  }

  Timer {
    id: refreshTimer
    interval: 10000
    running: true
    repeat: true
    onTriggered: root.refresh()
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰃰 " + root.activeTime
    horizontalMargin: 8.5
    tooltipText: "Activity tracker — click for usage details"

    onPressed: function(mouseButton) {
      if (mouseButton === Qt.MiddleButton) root.refresh()
      else root.togglePanel()
    }
  }
}
