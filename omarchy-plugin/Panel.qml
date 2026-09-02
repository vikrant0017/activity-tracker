import QtQuick
import qs.Commons
import qs.Ui

Panel {
  id: root
  moduleName: "vikrant.activity-tracker"
  ipcTarget: "vikrant.activity-tracker"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root
  property string activeTime: "XX:XX"
  property var topApps: []
  readonly property string dashboardCommand: "activity-tracker-open-dashboard"

  function open() {
    if (hostWidget && hostWidget.refresh) hostWidget.refresh()
    controller.show()
  }

  function close() {
    controller.hide()
  }

  function toggle() {
    if (opened) close()
    else open()
  }

  function closeForPopoutSwitch() {
    close()
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(360))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()

      Column {
        id: content
        width: parent.width
        spacing: Style.space(12)

        Item {
          width: parent.width
          height: header.implicitHeight + Style.space(24)

          Column {
            id: header
            anchors.left: parent.left
            anchors.leftMargin: Style.space(16)
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(3)

            Text {
              text: "Activity tracker"
              color: root.bar ? root.bar.foreground : Color.foreground
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.heading
              font.bold: true
            }
            Text {
              text: "Active time  " + root.activeTime
              color: Color.accent
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.body
            }
          }
        }

        Rectangle {
          width: parent.width - Style.space(32)
          height: 1
          anchors.horizontalCenter: parent.horizontalCenter
          color: Color.border
        }

        Column {
          width: parent.width - Style.space(32)
          anchors.horizontalCenter: parent.horizontalCenter
          spacing: Style.space(8)

          Text {
            text: "TOP APPLICATIONS"
            color: Color.muted
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.caption
            font.bold: true
          }

          Repeater {
            model: root.topApps
            delegate: Row {
              width: parent.width
              spacing: Style.space(8)

              Text {
                text: (index + 1) + "."
                color: Color.muted
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.body
              }
              Text {
                width: parent.width - durationText.implicitWidth - Style.space(32)
                text: modelData.app
                elide: Text.ElideRight
                color: root.bar ? root.bar.foreground : Color.foreground
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.body
              }
              Text {
                id: durationText
                text: modelData.duration
                color: Color.accent
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.body
              }
            }
          }

          Text {
            visible: root.topApps.length === 0
            text: "No activity recorded yet"
            color: Color.muted
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.body
          }
        }

        Rectangle {
          width: parent.width - Style.space(32)
          height: Style.space(34)
          anchors.horizontalCenter: parent.horizontalCenter
          radius: Style.cornerRadius
          color: Color.accent

          Text {
            anchors.centerIn: parent
            text: "Open dashboard"
            color: Color.background
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.body
            font.bold: true
          }

          MouseArea {
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            onClicked: {
              if (root.bar) root.bar.run(root.dashboardCommand)
              root.close()
            }
          }
        }

        Item { width: 1; height: Style.space(4) }
      }
    }
  }
}
