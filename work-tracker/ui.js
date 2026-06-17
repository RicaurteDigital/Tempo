// work-tracker/ui.js
const WorkTracker = {
  el: null,
  currentWeekStart: getWeekStart(new Date()).getTime(),
  shifts: [],
  
  async mount(el) {
    this.el = el;
    await WT_DB.init();
    this.render();
  },

  async loadWeek() {
    this.shifts = await WT_DB.getShiftsByWeek(this.currentWeekStart);
  },

  async render() {
    await this.loadWeek();
    let stats = WTRules.calculateWeek(this.shifts);
    
    this.el.innerHTML = `
      <div class="wt-header">
        <button onclick="WorkTracker.prevWeek()">←</button>
        <h2>${formatWeekLabel(new Date(this.currentWeekStart))}</h2>
        <button onclick="WorkTracker.nextWeek()">→</button>
      </div>
      <div class="wt-stats">
        <div>Horas Totales: ${stats.totalHours.toFixed(2)}h</div>
        <div>Pago Total Estimado: $${stats.totalPay.toFixed(2)}</div>
        ${stats.overtimePay > 0 ? `<div style="color:var(--leak)">Overtime incluido: $${stats.overtimePay.toFixed(2)}</div>` : ''}
      </div>
      <div class="wt-actions">
        <button onclick="WorkTracker.newShift()" class="wt-btn-primary">+ Nuevo Turno</button>
        <button onclick="window.print()" class="wt-btn-secondary">📄 Guardar PDF / Imprimir</button>
      </div>
      <div class="wt-shifts">
        ${this.shifts.length === 0 ? '<div class="wt-empty">No hay turnos registrados en esta semana.</div>' : ''}
        ${this.shifts.map(s => `
          <div class="wt-shift-card">
            <div class="wt-shift-header">
              <b>${s.location || 'Lugar de trabajo'}</b> - ${s.type} 
              <span>($${s.rate || NYC_MIN_WAGE}/h)</span>
            </div>
            <div class="wt-shift-times" ondblclick="WorkTracker.editShift('${s.id}')">
              <div>In: ${new Date(s.clockIn).toLocaleTimeString()} ${s.photoIn ? '📸' : ''}</div>
              <div>Out: ${s.clockOut ? new Date(s.clockOut).toLocaleTimeString() : '<button onclick="WorkTracker.clockOut(\''+s.id+'\')" class="wt-btn-small">Clock Out</button>'} ${s.photoOut ? '📸' : ''}</div>
            </div>
            <div class="wt-shift-footer">
              <span class="wt-edit-hint">Doble tap en la hora para editar</span>
              <button onclick="WorkTracker.deleteShift('${s.id}')" class="wt-btn-danger">Borrar</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },
  
  prevWeek() { this.currentWeekStart -= 7 * 86400000; this.render(); },
  nextWeek() { this.currentWeekStart += 7 * 86400000; this.render(); },
  
  async newShift() {
    let loc = prompt("Nombre del lugar:", "Manhattan Restaurant");
    if (!loc) return;
    let rate = parseFloat(prompt("Valor por hora ($):", NYC_MIN_WAGE)) || NYC_MIN_WAGE;
    let type = prompt("Turno (Breakfast, Lunch, Dinner, Double):", "Lunch") || "Lunch";
    
    let photoData = await this.capturePhoto();

    let shift = {
      id: generateId(),
      weekStart: getWeekStart(new Date()).getTime(),
      location: loc,
      rate: rate,
      type: type,
      clockIn: Date.now(),
      clockOut: null,
      photoIn: photoData ? true : false
    };
    
    if (photoData) await WT_DB.savePhoto(shift.id + '_in', photoData);
    await WT_DB.saveShift(shift);
    this.render();
  },

  async clockOut(id) {
    let shift = this.shifts.find(s => s.id === id);
    if (!shift) return;
    let photoData = await this.capturePhoto();
    shift.clockOut = Date.now();
    shift.photoOut = photoData ? true : false;
    if (photoData) await WT_DB.savePhoto(shift.id + '_out', photoData);
    await WT_DB.saveShift(shift);
    this.render();
  },

  async editShift(id) {
    let shift = this.shifts.find(s => s.id === id);
    if(!shift) return;
    let newIn = prompt("Modificar Clock In (formato YYYY/MM/DD HH:MM):", new Date(shift.clockIn).toLocaleString());
    if(newIn) {
      let pt = new Date(newIn).getTime();
      if(!isNaN(pt)) shift.clockIn = pt;
    }
    if(shift.clockOut) {
       let newOut = prompt("Modificar Clock Out (formato YYYY/MM/DD HH:MM):", new Date(shift.clockOut).toLocaleString());
       if(newOut) {
         let pt = new Date(newOut).getTime();
         if(!isNaN(pt)) shift.clockOut = pt;
       }
    }
    await WT_DB.saveShift(shift);
    this.render();
  },

  async deleteShift(id) {
    if(confirm("¿Seguro que quieres borrar este turno? Esto no se puede deshacer.")) {
      await WT_DB.deleteShift(id);
      this.render();
    }
  },

  capturePhoto() {
    return new Promise(resolve => {
      if(!confirm("¿Tomar foto como prueba?")) return resolve(null);
      let input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = e => {
        let file = e.target.files[0];
        if(!file) return resolve(null);
        let reader = new FileReader();
        reader.onload = ev => resolve(ev.target.result);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }
};
