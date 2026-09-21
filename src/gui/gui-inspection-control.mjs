import { Popup } from './gui-popup';
import { EventDispatcher } from './gui-events';
import { internal } from './gui-core';
import { deleteFeature } from './gui-drawing-utils';

export function InspectionControl2(gui, hit) {
  var _popup = new Popup(gui, hit.getSwitchTrigger(1), hit.getSwitchTrigger(-1));
  var _self = new EventDispatcher();

  gui.on('interaction_mode_change', function(e) {
    if (!gui.interaction.modeUsesPopup(e.mode)) {
      inspect(-1); // clear the popup
    }
  });

  _popup.on('data_updated', function(e) {
    // data_change event no longer needed (update is handled below)
    // _self.dispatchEvent('data_change', e.data); // let map know which field has changed
    gui.session.dataValueUpdated(e.ids, e.field, e.value);

    if (e.field == 'cycleway') {
      var cyclewayColours = {
        '': '#bdbdbd',
        'bikepath': '#008300',
        'shared_path': '#1baf7a',
        'separated_lane': '#2a78d6',
        'simple_lane': '#eda100',
        'inadequate_lane': '#eb6834',
        'shared_street': '#e34948'
      };
      var colour = cyclewayColours[e.value];
      if (colour) {
        var layer = gui.model.getActiveLayer().layer;
        if (layer && layer.data) {
          var records = layer.data.getRecords();
          var shapes = layer.shapes;
          var idsToUpdate = new Set(e.ids);

          // Helper to identify topologically equivalent shapes
          var getShapeKey = function(shape) {
            if (!shape || !shape.length) return null;
            if (Array.isArray(shape[0]) && typeof shape[0][0] === 'number') {
              var arcs = [];
              for (var i=0; i<shape.length; i++) {
                for (var j=0; j<shape[i].length; j++) {
                  var id = shape[i][j];
                  arcs.push(id < 0 ? ~id : id);
                }
              }
              return arcs.sort(function(a, b) { return a - b; }).join(',');
            }
            return null;
          };

          if (shapes) {
             var targetKeys = [];
             e.ids.forEach(function(id) {
                 var key = getShapeKey(shapes[id]);
                 if (key) targetKeys.push(key);
             });
             
             if (targetKeys.length > 0) {
                 for (var i=0; i<shapes.length; i++) {
                     if (idsToUpdate.has(i)) continue;
                     var key = getShapeKey(shapes[i]);
                     if (key && targetKeys.includes(key)) {
                         if (records[i] && (records[i].highway == 'bus' || records[i].highway == 'train')) {
                             continue;
                         }
                         idsToUpdate.add(i);
                     }
                 }
             }
          }

          var allIds = Array.from(idsToUpdate);
          allIds.forEach(function(id) {
            if (records[id]) {
              // Only apply colour if highway is not bus or train
              if (records[id].highway != 'bus' && records[id].highway != 'train') {
                records[id].stroke = colour;
              }
              if (!e.ids.includes(id)) {
                  records[id].cycleway = e.value;
              }
            }
          });
          
          gui.session.dataValueUpdated(e.ids, 'stroke', colour);
          
          var otherIds = allIds.filter(function(id) { return !e.ids.includes(id); });
          if (otherIds.length > 0) {
              gui.session.dataValueUpdated(otherIds, 'cycleway', e.value);
              gui.session.dataValueUpdated(otherIds, 'stroke', colour);
          }

          gui.dispatchEvent('map-needs-refresh');
        }
      }
    }

    // Refresh the display if a style variable has been changed interactively
    if (internal.isSupportedSvgStyleProperty(e.field)) {
      gui.dispatchEvent('map-needs-refresh');
    }
  });

  hit.on('contextmenu', function(e) {
    if (!e.overMap || e.mode == 'edit_lines' || e.mode == 'edit_polygons' ||
      e.mode == 'edit_points' || e.mode == 'snip_lines') {
      return;
    }
    var target = hit.getHitTarget();
    if (e.ids.length == 1) {
      e.deleteFeature = function() {
        deleteFeature(target, e.ids[0]);
        gui.model.updated({filter:true});
      };
    }
    gui.contextMenu.open(e, target);
  });

  hit.on('change', function(e) {
    if (!inspecting()) return;
    if (gui.keyboard.ctrlIsPressed()) return;
    var ids = e.ids || [];
    inspect(e.mode == 'selection' ? -1 : e.id, ids, e.mode == 'selection' || e.pinned);
  });

  // id: Id of a feature in the active layer, or -1
  function inspect(id, ids, pin) {
    var target = hit.getHitTarget();
    if ((id > -1 || ids && ids.length > 0) && inspecting() && target && target) {
      _popup.show(id, ids, target, pin);
    } else {
      _popup.hide();
    }
  }

  // does the attribute inspector appear on rollover
  function inspecting() {
    return gui.interaction && gui.interaction.modeUsesPopup(gui.interaction.getMode());
  }

  return _self;
}
