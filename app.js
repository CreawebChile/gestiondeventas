import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js';
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc, query, where } from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js';

const app = window.firebaseApp;
const auth = getAuth(app);
const db = getFirestore(app);

// Agregar después de las importaciones existentes
let currentFilter = null;
let currentSales = [];

function showLoading(element) {
    element.classList.add('loading');
    element.disabled = true;
}

function hideLoading(element) {
    element.classList.remove('loading');
    element.disabled = false;
}

// Utility functions
function formatCLP(amount) {
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP'
    }).format(amount);
}

function calculateDurationInDays(duration, periodType) {
    switch(periodType) {
        case 'days':
            return duration;
        case 'months':
            return duration * 30;
        case 'years':
            return duration * 365;
        default:
            return duration;
    }
}

function formatDuration(duration, periodType) {
    if (duration === 1) {
        return `1 ${periodType.slice(0, -1)}`;
    }
    return `${duration} ${periodType}`;
}

// Add timezone utilities
function getChileDateTime() {
    try {
        const now = new Date();
        const chileDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
        return chileDate.toISOString();
    } catch (error) {
        console.error('Error al obtener fecha Chile:', error);
        return new Date().toISOString(); // Fallback a fecha UTC
    }
}

// Modificar la función formatChileDate para manejar mejor las fechas ISO
function formatChileDate(date) {
    if (!date) return 'Fecha no disponible';
    
    try {
        // Intentar crear un nuevo objeto Date desde la entrada
        const dateObj = new Date(date);
        
        // Verificar si la fecha es válida
        if (isNaN(dateObj.getTime())) {
            return 'Fecha inválida';
        }
        
        return dateObj.toLocaleDateString('es-CL', {
            timeZone: 'America/Santiago',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch (error) {
        console.error('Error al formatear fecha:', error);
        return 'Fecha inválida';
    }
}

// Add contact utilities
function formatWhatsAppLink(number, message) {
    const formattedMessage = encodeURIComponent(message);
    return `https://wa.me/56${number}?text=${formattedMessage}`;
}

function formatContactInfo(sale) {
    let contactHtml = '';
    
    if (sale.whatsapp) {
        const message = `Hola ${sale.client}, te quedan ${calculateDaysRemaining(sale.startDate, sale.endDate)} días de tu suscripción de ${sale.product}`;
        contactHtml += `
            <p class="mb-1">
                <a href="${formatWhatsAppLink(sale.whatsapp, message)}" target="_blank" class="text-decoration-none">
                    <i class="fab fa-whatsapp me-2 text-success"></i>+56 ${sale.whatsapp}
                </a>
            </p>`;
    }
    
    if (sale.email) {
        contactHtml += `
            <p class="mb-1">
                <a href="mailto:${sale.email}" class="text-decoration-none">
                    <i class="fas fa-envelope me-2 text-primary"></i>${sale.email}
                </a>
            </p>`;
    }
    
    if (sale.instagram) {
        contactHtml += `
            <p class="mb-1">
                <a href="https://instagram.com/${sale.instagram}" target="_blank" class="text-decoration-none">
                    <i class="fab fa-instagram me-2 text-danger"></i>@${sale.instagram}
                </a>
            </p>`;
    }
    
    if (sale.facebook) {
        contactHtml += `
            <p class="mb-1">
                <a href="${sale.facebook.startsWith('http') ? sale.facebook : 'https://facebook.com/' + sale.facebook}" 
                   target="_blank" class="text-decoration-none">
                    <i class="fab fa-facebook me-2 text-primary"></i>${sale.facebook}
                </a>
            </p>`;
    }
    
    return contactHtml;
}

// Add function to format full sale info for sharing
function formatSaleInfoForSharing(sale) {
    const daysRemaining = calculateDaysRemaining(sale.startDate, sale.endDate);
    let info = `📦 ${sale.product}\n`;
    info += `💰 Precio: ${formatCLP(sale.price)}\n`;
    info += `📅 Inicio: ${formatChileDate(sale.startDate)}\n`;
    info += `🔚 Vence: ${formatChileDate(sale.endDate)}\n`;
    info += `⏳ ${daysRemaining > 0 ? `Quedan ${daysRemaining} días` : 'Vencido'}\n\n`;
    
    if (sale.accountCredentials) {
        info += "🔐 Datos de Acceso:\n";
        if (sale.accountCredentials.username) info += `👤 Usuario: ${sale.accountCredentials.username}\n`;
        if (sale.accountCredentials.password) info += `🔑 Contraseña: ${sale.accountCredentials.password}\n`;
        if (sale.accountCredentials.profile) info += `👥 Perfil: ${sale.accountCredentials.profile}\n`;
        if (sale.accountCredentials.pin) info += `📌 PIN: ${sale.accountCredentials.pin}\n`;
    }
    
    if (sale.notes) info += `\n📝 Notas: ${sale.notes}`;
    
    return info;
}

// Auth form toggling
document.getElementById('showRegisterForm').addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('.auth-form-container').classList.add('show-register');
});

document.getElementById('showLoginForm').addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('.auth-form-container').classList.remove('show-register');
});

// Password recovery toggle
document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('authForm').style.display = 'none';
    document.getElementById('recoveryForm').classList.add('active');
});

document.getElementById('backToLogin').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('authForm').style.display = 'block';
    document.getElementById('recoveryForm').classList.remove('active');
});

// Update auth form submissions
document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    showLoading(submitBtn);
    
    try {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        if (!email || !password) {
            throw new Error('Por favor ingresa email y contraseña');
        }

        await signInWithEmailAndPassword(auth, email, password);
        showSuccess('Inicio de sesión exitoso');
    } catch (error) {
        let errorMessage = '';
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = 'Usuario no encontrado';
                break;
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                errorMessage = 'Contraseña incorrecta';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Email inválido';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Demasiados intentos fallidos. Por favor, inténtalo más tarde';
                break;
            default:
                errorMessage = 'Error al iniciar sesión. Por favor, inténtalo de nuevo';
        }
        showError(errorMessage);
    } finally {
        hideLoading(submitBtn);
    }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    showLoading(submitBtn);
    
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
    
    if (password !== passwordConfirm) {
        showError('Las contraseñas no coinciden');
        hideLoading(submitBtn);
        return;
    }
    
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        showSuccess('Cuenta creada exitosamente');
    } catch (error) {
        showError('Error de registro: ' + error.message);
    } finally {
        hideLoading(submitBtn);
    }
});

document.getElementById('recoveryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    showLoading(submitBtn);
    
    try {
        const email = document.getElementById('recoveryEmail').value;
        await sendPasswordResetEmail(auth, email);
        showSuccess('Se ha enviado un enlace de recuperación a tu email');
        document.getElementById('recoveryForm').classList.remove('active');
        document.getElementById('authForm').style.display = 'block';
    } catch (error) {
        showError('Error al enviar email de recuperación: ' + error.message);
    } finally {
        hideLoading(submitBtn);
    }
});

// Utility functions for notifications
function showError(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification bg-danger';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification bg-success';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Eliminar este listener duplicado ya que tenemos uno más arriba que hace lo mismo
// document.getElementById('authForm').addEventListener('submit', async (e) => {
//     e.preventDefault();
//     const submitBtn = e.target.querySelector('button[type="submit"]');
//     showLoading(submitBtn);
//     const email = document.getElementById('email').value;
//     const password = document.getElementById('password').value;
    
//     try {
//         await signInWithEmailAndPassword(auth, email, password);
//     } catch (error) {
//         alert('Error: ' + error.message);
//     } finally {
//         hideLoading(submitBtn);
//     }
// });

// Eliminar este evento ya que ahora usamos el nuevo sistema de autenticación
// document.getElementById('registerBtn').addEventListener('click', async () => {
//     // ...remove this event listener...
// });

document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth);
});

// Sales functionality
document.getElementById('saleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const duration = parseInt(document.getElementById('duration').value);
    const periodType = document.getElementById('periodType').value;
    const durationInDays = calculateDurationInDays(duration, periodType);
    const startDate = new Date(document.getElementById('startDate').value);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + durationInDays);

    const sale = {
        product: document.getElementById('productName').value,
        client: document.getElementById('clientName').value,
        price: parseInt(document.getElementById('price').value),
        duration: durationInDays,
        periodType: periodType,
        originalDuration: duration,
        notes: document.getElementById('notes').value || '',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        status: document.getElementById('saleStatus').value,
        userId: auth.currentUser.uid,
        createdAt: getChileDateTime(), // Fecha real de creación del registro
        whatsapp: document.getElementById('whatsapp').value,
        email: document.getElementById('email').value,
        instagram: document.getElementById('instagram').value,
        facebook: document.getElementById('facebook').value,
        accountCredentials: {
            username: document.getElementById('accountUser').value || null,
            password: document.getElementById('accountPassword').value || null,
            profile: document.getElementById('accountProfile').value || null,
            pin: document.getElementById('profilePin').value || null
        }
    };

    try {
        await addDoc(collection(db, 'sales'), sale);
        const modal = bootstrap.Modal.getInstance(document.getElementById('saleModal'));
        modal.hide();
        loadSales();
    } catch (error) {
        alert('Error al guardar: ' + error.message);
    }
});

// Update calculateDaysRemaining function for more accurate calculations
function calculateDaysRemaining(startDate, endDate) {
    try {
        // Crear objetos Date desde las cadenas ISO
        const now = new Date(getChileDateTime());
        const end = new Date(endDate);
        
        // Verificar si las fechas son válidas
        if (isNaN(end.getTime())) {
            console.error('Fecha de finalización inválida:', endDate);
            return 0;
        }

        const diffTime = end - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    } catch (error) {
        console.error('Error calculando días restantes:', error);
        return 0;
    }
}

function getStatusInfo(daysRemaining, status, sale) {
    if (status === 'completed') {
        return {
            class: 'bg-secondary',
            text: 'Completada',
            isActive: false,
            isCompleted: true
        };
    }

    if (daysRemaining < 0) {
        return {
            class: 'days-red',
            text: 'Vencido',
            isActive: false,
            isExpired: true
        };
    }

    if (daysRemaining === 0) {
        return {
            class: 'days-orange',
            text: 'Vence hoy',
            isActive: true,
            isExpiringToday: true
        };
    }

    // Calcular el porcentaje de tiempo transcurrido
    const elapsedPercentage = calculateElapsedPercentage(sale);

    if (elapsedPercentage >= 50) {
        return {
            class: 'days-orange',
            text: `Por vencer (${daysRemaining} días)`,
            isActive: true,
            isNearExpiry: true,
            elapsedPercentage
        };
    }

    return {
        class: 'days-green',
        text: `Próximo a vencer (${daysRemaining} días)`,
        isActive: true,
        elapsedPercentage
    };
}

// Add function to calculate elapsed time percentage
function calculateElapsedPercentage(sale) {
    try {
        const start = new Date(sale.startDate);
        const end = new Date(sale.endDate);
        const now = new Date(getChileDateTime());
        
        const totalDuration = end - start;
        const elapsed = now - start;
        
        return (elapsed / totalDuration) * 100;
    } catch (error) {
        console.error('Error calculando porcentaje transcurrido:', error);
        return 0;
    }
}

// Add function to check if sale is expired
function isSaleExpired(endDate) {
    const now = getChileDateTime();
    const end = new Date(endDate);
    return now > end;
}

// Modificar la función loadSales para garantizar el aislamiento de datos
async function loadSales() {
    // Resetear estadísticas al inicio
    updateDashboardStats({
        active: 0,
        nearExpiry: 0,
        expiringToday: 0,
        expired: 0,
        totalAmount: 0
    });

    const salesList = document.getElementById('salesList');
    salesList.innerHTML = '<div class="col-12 text-center"><div class="loading"></div></div>';
    
    try {
        // Verificar si hay un usuario autenticado
        if (!auth.currentUser) {
            throw new Error('No hay usuario autenticado');
        }

        // Crear query explícitamente filtrado por userId
        const salesQuery = query(
            collection(db, 'sales'),
            where('userId', '==', auth.currentUser.uid)
        );
        
        // Limpiar el array de ventas actuales
        currentSales = [];
        
        const querySnapshot = await getDocs(salesQuery);
        
        if (querySnapshot.empty) {
            salesList.innerHTML = `
                <div class="col-12 text-center">
                    <div class="p-5">
                        <i class="fas fa-box-open fa-3x mb-3 text-muted"></i>
                        <h4 class="text-muted">No hay ventas registradas</h4>
                        <p class="text-muted">Comienza creando una nueva suscripción</p>
                    </div>
                </div>
            `;
            return;
        }

        querySnapshot.forEach((doc) => {
            const sale = {...doc.data(), id: doc.id};
            // Verificar que la venta pertenezca al usuario actual
            if (sale.userId === auth.currentUser.uid) {
                currentSales.push(sale);
            }
        });
        
        applyFiltersAndSort();
        
    } catch (error) {
        console.error("Error loading sales:", error);
        salesList.innerHTML = `
            <div class="col-12 text-center">
                <div class="alert alert-danger">
                    Error al cargar las ventas: ${error.message}
                </div>
            </div>
        `;
    }
}

// Función para renderizar las ventas filtradas
function renderSales(sales) {
    const salesList = document.getElementById('salesList');
    
    if (sales.length === 0) {
        salesList.innerHTML = `
            <div class="col-12 text-center">
                <div class="p-5">
                    <i class="fas fa-filter fa-3x mb-3 text-muted"></i>
                    <h4 class="text-muted">No se encontraron resultados</h4>
                </div>
            </div>
        `;
        return;
    }
    
    salesList.innerHTML = '';
    let stats = { active: 0, nearExpiry: 0, expiringToday: 0, expired: 0, totalAmount: 0 };
    
    sales.forEach(sale => {
        const daysRemaining = calculateDaysRemaining(sale.startDate, sale.endDate);
        const elapsedPercentage = calculateElapsedPercentage(sale);
        
        if (sale.status !== 'completed') {
            if (daysRemaining < 0) {
                stats.expired++;
            } else if (daysRemaining === 0) {
                stats.expiringToday++;
            } else if (elapsedPercentage >= 50) {
                stats.nearExpiry++;
            } else {
                stats.active++;
            }
        }
        
        stats.totalAmount += sale.price;

        const status = getStatusInfo(daysRemaining, sale.status, sale);
        const isExpired = isSaleExpired(sale.endDate);

        // Add progress bar to show elapsed time
        const progressBar = `
            <div class="progress mb-2" style="height: 4px;">
                <div class="progress-bar ${status.class}" 
                     role="progressbar" 
                     style="width: ${status.elapsedPercentage}%"
                     aria-valuenow="${status.elapsedPercentage}" 
                     aria-valuemin="0" 
                     aria-valuemax="100">
                </div>
            </div>
        `;

        // Update sale card HTML
        salesList.innerHTML += `
            <div class="col-md-4 col-sm-6">
                <div class="sale-card ${sale.status === 'completed' ? 'completed-sale' : ''}"
                     data-status="${status.isExpired ? 'expired' : status.isNearExpiry ? 'near-expiry' : 'active'}">
                    <div class="card-body">
                        ${progressBar}
                        <div class="d-flex justify-content-between align-items-start mb-3">
                            <h5 class="card-title fw-bold mb-0">${sale.product}</h5>
                            <div>
                                <span class="days-remaining ${status.class}">
                                    ${status.text}
                                </span>
                            </div>
                        </div>
                        <div class="mb-3">
                            <p class="mb-1"><i class="fas fa-user me-2"></i>${sale.client}</p>
                            <p class="mb-1"><i class="fas fa-dollar-sign me-2"></i>${formatCLP(sale.price)}</p>
                            <p class="mb-1"><i class="fas fa-clock me-2"></i>${formatDuration(sale.originalDuration, sale.periodType)}</p>
                            <p class="mb-1"><i class="fas fa-calendar me-2"></i>Inicio: ${formatChileDate(sale.startDate)}</p>
                            <p class="mb-1"><i class="fas fa-calendar-check me-2"></i>Vence: ${formatChileDate(sale.endDate)}</p>
                            ${formatContactInfo(sale)}
                            ${formatAccountInfo(sale)}
                            ${sale.notes ? `<p class="mb-1 text-muted"><i class="fas fa-sticky-note me-2"></i>${sale.notes}</p>` : ''}
                            <p class="mb-1 text-muted">
                                <small>
                                    <i class="fas fa-info-circle me-2"></i>
                                    Registrado: ${formatChileDate(sale.createdAt)}
                                    ${sale.renewedAt ? `<br><i class="fas fa-sync me-2"></i>Renovado: ${formatChileDate(sale.renewedAt)}` : ''}
                                </small>
                            </p>
                        </div>
                        <div class="d-flex gap-2">
                            ${!status.isCompleted ? `
                                <button onclick="editSale('${sale.id}')" class="btn btn-sm btn-primary">
                                    <i class="fas fa-edit me-2"></i>Editar
                                </button>
                                ${isExpired ? `
                                    <button onclick="renewSale('${sale.id}')" class="btn btn-sm btn-success">
                                        <i class="fas fa-sync me-2"></i>Renovar
                                    </button>
                                ` : ''}
                            ` : ''}
                            <button onclick="toggleStatus('${sale.id}', '${sale.status}')" class="btn btn-sm btn-secondary">
                                <i class="fas fa-exchange-alt me-2"></i>${sale.status === 'completed' ? 'Reactivar' : 'Completar'}
                            </button>
                            <button onclick="deleteSale('${sale.id}')" class="btn btn-danger btn-sm">
                                <i class="fas fa-trash me-2"></i>Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    updateDashboardStats(stats);
}

// Add function to handle filters
async function loadFilters() {
    try {
        const filtersQuery = query(
            collection(db, 'filters'),
            where('userId', '==', auth.currentUser.uid)
        );
        
        const snapshot = await getDocs(filtersQuery);
        const filtersList = document.getElementById('filtersList');
        
        // Mantener los elementos fijos
        filtersList.innerHTML = `
            <li><a class="dropdown-item" href="#" onclick="clearFilters()">Mostrar todo</a></li>
            <li><hr class="dropdown-divider"></li>
        `;
        
        snapshot.forEach(doc => {
            const filter = doc.data();
            filtersList.innerHTML += `
                <li>
                    <div class="dropdown-item d-flex align-items-center justify-content-between">
                        <a href="#" onclick="applyFilter('${doc.id}')" class="text-decoration-none text-dark flex-grow-1">
                            ${filter.name}
                        </a>
                        <button class="btn btn-sm btn-link text-danger" onclick="deleteFilter('${doc.id}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </li>
            `;
        });
    } catch (error) {
        console.error('Error loading filters:', error);
    }
}

// Agregar manejo del formulario de filtros
document.getElementById('filterForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
        const filterData = {
            name: document.getElementById('filterName').value,
            keywords: document.getElementById('filterKeywords').value
                .split(',')
                .map(k => k.trim().toLowerCase())
                .filter(k => k),
            userId: auth.currentUser.uid,
            createdAt: getChileDateTime()
        };
        
        await addDoc(collection(db, 'filters'), filterData);
        
        // Limpiar y cerrar el modal
        e.target.reset();
        bootstrap.Modal.getInstance(document.getElementById('filterModal')).hide();
        
        // Recargar filtros
        loadFilters();
        showSuccess('Filtro creado exitosamente');
    } catch (error) {
        showError('Error al crear filtro: ' + error.message);
    }
});

// Funciones para el manejo de filtros
window.clearFilters = function() {
    currentFilter = null;
    applyFiltersAndSort();
};

window.applyFilter = async function(filterId) {
    try {
        const filterDoc = await getDoc(doc(db, 'filters', filterId));
        currentFilter = { id: filterId, ...filterDoc.data() };
        applyFiltersAndSort();
    } catch (error) {
        showError('Error al aplicar filtro: ' + error.message);
    }
};

window.deleteFilter = async function(filterId) {
    if (confirm('¿Eliminar este filtro?')) {
        try {
            await deleteDoc(doc(db, 'filters', filterId));
            if (currentFilter?.id === filterId) {
                clearFilters();
            }
            loadFilters();
            showSuccess('Filtro eliminado exitosamente');
        } catch (error) {
            showError('Error al eliminar filtro: ' + error.message);
        }
    }
};

// Función para aplicar filtros y ordenamiento
function applyFiltersAndSort() {
    let filteredSales = [...currentSales];
    
    // Aplicar filtro si existe
    if (currentFilter) {
        filteredSales = filteredSales.filter(sale => {
            const searchText = `${sale.product} ${sale.client} ${sale.notes || ''}`.toLowerCase();
            return currentFilter.keywords.some(keyword => searchText.includes(keyword));
        });
    }
    
    // Aplicar ordenamiento
    const sortOrder = document.getElementById('sortOrder').value;
    filteredSales.sort((a, b) => {
        switch (sortOrder) {
            case 'newest':
                return new Date(b.createdAt) - new Date(a.createdAt);
            case 'oldest':
                return new Date(a.createdAt) - new Date(b.createdAt);
            case 'nameAsc':
                return a.product.localeCompare(b.product);
            case 'nameDesc':
                return b.product.localeCompare(a.product);
            default:
                return 0;
        }
    });
    
    // Actualizar vista
    renderSales(filteredSales);
}

// Add edit and renewal functions
async function fillEditModal(saleId) {
    try {
        const saleDoc = await getDoc(doc(db, 'sales', saleId));
        const sale = saleDoc.data();
        
        document.getElementById('editSaleId').value = saleId;
        document.getElementById('editProductName').value = sale.product;
        document.getElementById('editClientName').value = sale.client;
        document.getElementById('editPrice').value = sale.price;
        document.getElementById('editNotes').value = sale.notes || '';
        document.getElementById('editWhatsapp').value = sale.whatsapp || '';
        document.getElementById('editEmail').value = sale.email || '';
        document.getElementById('editInstagram').value = sale.instagram || '';
        document.getElementById('editFacebook').value = sale.facebook || '';
        
        if (sale.accountCredentials) {
            document.getElementById('editAccountUser').value = sale.accountCredentials.username || '';
            document.getElementById('editAccountPassword').value = sale.accountCredentials.password || '';
            document.getElementById('editAccountProfile').value = sale.accountCredentials.profile || '';
            document.getElementById('editProfilePin').value = sale.accountCredentials.pin || '';
        }
        
        new bootstrap.Modal(document.getElementById('editModal')).show();
    } catch (error) {
        alert('Error al cargar los datos: ' + error.message);
    }
}

// Add function to calculate total days for renewal
function calculateRenewalDays(currentEndDate, duration, periodType) {
    const remainingDays = calculateDaysRemaining(null, currentEndDate);
    const newDays = calculateDurationInDays(duration, periodType);
    
    // If subscription hasn't expired yet, add remaining days
    return remainingDays > 0 ? newDays + remainingDays : newDays;
}

// Update renewSale function
async function fillRenewModal(saleId) {
    try {
        const saleDoc = await getDoc(doc(db, 'sales', saleId));
        const sale = saleDoc.data();
        
        // Check if sale is expired before allowing renewal
        if (!isSaleExpired(sale.endDate)) {
            alert('Solo se pueden renovar suscripciones vencidas.');
            return;
        }

        // Store the complete sale data including endDate
        document.getElementById('renewSaleId').value = saleId;
        document.getElementById('renewCurrentSale').value = JSON.stringify({
            product: sale.product,
            client: sale.client,
            whatsapp: sale.whatsapp || '',
            email: sale.email || '',
            instagram: sale.instagram || '',
            facebook: sale.facebook || '',
            notes: sale.notes || '',
            accountCredentials: sale.accountCredentials || {},
            userId: sale.userId,
            endDate: sale.endDate
        });
        
        // Remove remaining days info since it's expired
        const oldInfo = document.querySelector('#renewModal .alert');
        if (oldInfo) oldInfo.remove();
        
        // Pre-fill form fields but start from current date
        document.getElementById('renewDuration').value = sale.originalDuration;
        document.getElementById('renewPeriodType').value = sale.periodType;
        document.getElementById('renewPrice').value = sale.price;
        
        new bootstrap.Modal(document.getElementById('renewModal')).show();
    } catch (error) {
        alert('Error al cargar los datos para renovación: ' + error.message);
    }
}

// Add form event listeners
document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const saleId = document.getElementById('editSaleId').value;
    
    try {
        await updateDoc(doc(db, 'sales', saleId), {
            product: document.getElementById('editProductName').value,
            client: document.getElementById('editClientName').value,
            price: parseInt(document.getElementById('editPrice').value),
            notes: document.getElementById('editNotes').value || '',
            whatsapp: document.getElementById('editWhatsapp').value,
            email: document.getElementById('editEmail').value,
            instagram: document.getElementById('editInstagram').value,
            facebook: document.getElementById('editFacebook').value,
            accountCredentials: {
                username: document.getElementById('editAccountUser').value || null,
                password: document.getElementById('editAccountPassword').value || null,
                profile: document.getElementById('editAccountProfile').value || null,
                pin: document.getElementById('editProfilePin').value || null
            },
            updatedAt: getChileDateTime() // Agregar timestamp de actualización
        });
        
        bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
        loadSales();
    } catch (error) {
        alert('Error al guardar los cambios: ' + error.message);
    }
});

// Update renewal form submission
document.getElementById('renewForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
        const currentSaleData = JSON.parse(document.getElementById('renewCurrentSale').value);
        const duration = parseInt(document.getElementById('renewDuration').value);
        const periodType = document.getElementById('renewPeriodType').value;
        
        // Calculate total days including remaining days
        const totalDays = calculateRenewalDays(currentSaleData.endDate, duration, periodType);
        
        // Calculate dates starting from current end date if not expired
        const now = getChileDateTime();
        const currentEnd = new Date(currentSaleData.endDate);
        const startDate = currentEnd > now ? currentEnd : now;
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + totalDays);

        const renewalSale = {
            ...currentSaleData,
            price: parseInt(document.getElementById('renewPrice').value),
            duration: totalDays,
            periodType: periodType,
            originalDuration: duration,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            status: 'active',
            createdAt: now.toISOString(),
            isRenewal: true,
            previousSaleId: document.getElementById('renewSaleId').value,
            totalDaysIncludingRemaining: totalDays
        };

        // Create new renewal record
        await addDoc(collection(db, 'sales'), renewalSale);
        
        // Update original sale as completed
        await updateDoc(doc(db, 'sales', document.getElementById('renewSaleId').value), {
            status: 'completed',
            renewedAt: getChileDateTime()
        });
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('renewModal'));
        modal.hide();
        
        // Clear form
        document.getElementById('renewForm').reset();
        
        // Reload sales list
        loadSales();
        
        alert('Suscripción renovada exitosamente');
    } catch (error) {
        console.error('Error en renovación:', error);
        alert('Error al renovar la suscripción: ' + error.message);
    }
});

// Make functions available globally
window.editSale = fillEditModal;
window.renewSale = fillRenewModal;

// Add password visibility toggle function
window.togglePasswordVisibility = function(element) {
    const passwordText = element.querySelector('.password-text');
    const dots = element.firstChild;
    
    if (passwordText.style.display === 'none') {
        dots.style.display = 'none';
        passwordText.style.display = 'inline';
        setTimeout(() => {
            dots.style.display = 'inline';
            passwordText.style.display = 'none';
        }, 2000);
    }
};

// Update formatAccountInfo function
function formatAccountInfo(sale) {
    if (!sale.accountCredentials || 
        (!sale.accountCredentials.username && !sale.accountCredentials.password)) {
        return '';
    }

    const copyButton = `
        <div class="mt-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyToClipboard('${encodeURIComponent(JSON.stringify(sale))}')">
                <i class="fas fa-copy me-1"></i>Copiar datos de acceso
            </button>
        </div>
    `;

    return `
        <div class="account-info mb-3 p-2 bg-light rounded">
            <p class="mb-1 fw-bold"><i class="fas fa-user-shield me-2"></i>Datos de Acceso:</p>
            ${sale.accountCredentials.username ? 
                `<p class="mb-1 small"><i class="fas fa-user me-2"></i>Usuario: ${sale.accountCredentials.username}</p>` : ''}
            ${sale.accountCredentials.password ?
                `<p class="mb-1 small">
                    <i class="fas fa-key me-2"></i>Contraseña: 
                    <span class="password-wrapper">
                        <span class="password-dots">${'•'.repeat(sale.accountCredentials.password.length)}</span>
                        <span class="password-text" style="display:none">${sale.accountCredentials.password}</span>
                        <button type="button" class="btn btn-sm btn-outline-secondary ms-2" onclick="togglePasswordDisplay(this)">
                            <i class="fas fa-eye"></i>
                        </button>
                    </span>
                </p>` : ''}
            ${sale.accountCredentials.profile ?
                `<p class="mb-1 small"><i class="fas fa-user-circle me-2"></i>Perfil: ${sale.accountCredentials.profile}</p>` : ''}
            ${sale.accountCredentials.pin ?
                `<p class="mb-1 small">
                    <i class="fas fa-key me-2"></i>PIN: 
                    <span class="password-wrapper">
                        <span class="password-dots">${'•'.repeat(sale.accountCredentials.pin.length)}</span>
                        <span class="password-text" style="display:none">${sale.accountCredentials.pin}</span>
                        <button type="button" class="btn btn-sm btn-outline-secondary ms-2" onclick="togglePasswordDisplay(this)">
                            <i class="fas fa-eye"></i>
                        </button>
                    </span>
                </p>` : ''}
            ${copyButton}
        </div>
    `;
}

// Add new password toggle function
window.togglePasswordDisplay = function(button) {
    const wrapper = button.closest('.password-wrapper');
    const dots = wrapper.querySelector('.password-dots');
    const text = wrapper.querySelector('.password-text');
    const icon = button.querySelector('i');
    
    if (dots.style.display !== 'none') {
        dots.style.display = 'none';
        text.style.display = 'inline';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        dots.style.display = 'inline';
        text.style.display = 'none';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
};

// Keep only the clipboard functionality
window.copyToClipboard = function(saleData) {
    const sale = JSON.parse(decodeURIComponent(saleData));
    const info = formatSaleInfoForSharing(sale);
    
    navigator.clipboard.writeText(info).then(() => {
        // Show success message
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = '✅ Datos copiados al portapapeles';
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 2000);
    }).catch(err => {
        alert('Error al copiar: ' + err);
    });
};

// Add dashboard stats update function
// Modificar la función updateDashboardStats para evitar NaN
function updateDashboardStats({ active, nearExpiry, expiringToday, expired, totalAmount }) {
    const elements = {
        activeSubscriptions: {
            element: document.getElementById('activeSubscriptions'),
            current: parseInt(document.getElementById('activeSubscriptions').textContent) || 0,
            target: active || 0
        },
        nearExpiration: {
            element: document.getElementById('nearExpiration'),
            current: parseInt(document.getElementById('nearExpiration').textContent) || 0,
            target: nearExpiry || 0
        },
        expiringToday: {
            element: document.getElementById('expiringToday'),
            current: parseInt(document.getElementById('expiringToday').textContent) || 0,
            target: expiringToday || 0
        },
        expiredSubscriptions: {
            element: document.getElementById('expiredSubscriptions'),
            current: parseInt(document.getElementById('expiredSubscriptions').textContent) || 0,
            target: expired || 0
        }
    };

    // Animate number changes
    for (const key in elements) {
        const { element, current, target } = elements[key];
        if (element) { // Verificar que el elemento exista
            animateNumber(element, current, target);
        }
    }

    // Update total amount with fallback to 0
    document.getElementById('totalSales').innerHTML = 
        `<i class="fas fa-dollar-sign me-2"></i>Total: ${formatCLP(totalAmount || 0)}`;
}

// Add smooth number animation
function animateNumber(element, start, end) {
    const duration = 500; // milliseconds
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const value = Math.floor(start + (end - start) * progress);
        element.textContent = value;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

// Add trash management functions
async function updateTrashCount() {
    try {
        if (!auth.currentUser) return;

        const trashQuery = query(
            collection(db, 'trash'),
            where('userId', '==', auth.currentUser.uid)
        );
        
        const trashSnapshot = await getDocs(trashQuery);
        const count = trashSnapshot.size;
        document.getElementById('trashCount').textContent = count;
        document.getElementById('emptyTrashBtn').style.display = count > 0 ? 'inline-block' : 'none';
    } catch (error) {
        console.error('Error counting trash:', error);
    }
}

async function loadTrashItems() {
    const trashList = document.getElementById('trashList');
    trashList.innerHTML = '<div class="text-center"><div class="spinner-border"></div></div>';
    
    try {
        if (!auth.currentUser) {
            throw new Error('No hay usuario autenticado');
        }

        const trashQuery = query(
            collection(db, 'trash'),
            where('userId', '==', auth.currentUser.uid)
        );
        
        const snapshot = await getDocs(trashQuery);
        trashList.innerHTML = '';
        
        if (snapshot.empty) {
            trashList.innerHTML = `
                <div class="text-center text-muted p-4">
                    <i class="fas fa-trash fa-3x mb-3"></i>
                    <p>La papelera está vacía</p>
                </div>
            `;
            return;
        }

        snapshot.forEach(doc => {
            const item = doc.data();
            trashList.innerHTML += `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-1">${item.product}</h6>
                            <p class="mb-1 small text-muted">
                                Cliente: ${item.client}<br>
                                Eliminado: ${formatChileDate(item.deletedAt)}
                            </p>
                        </div>
                        <div class="btn-group">
                            <button class="btn btn-success btn-sm" onclick="restoreFromTrash('${doc.id}')">
                                <i class="fas fa-undo me-1"></i>Restaurar
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="deleteFromTrash('${doc.id}')">
                                <i class="fas fa-times me-1"></i>Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        trashList.innerHTML = `
            <div class="alert alert-danger">
                Error al cargar la papelera: ${error.message}
            </div>
        `;
    }
}

window.restoreFromTrash = async (trashId) => {
    try {
        const trashDoc = await getDoc(doc(db, 'trash', trashId));
        const itemData = trashDoc.data();
        
        // Verificar que el elemento pertenezca al usuario actual
        if (itemData.userId !== auth.currentUser.uid) {
            throw new Error('No tienes permiso para restaurar este elemento');
        }
        
        // Remove trash-specific fields but preserve userId
        const { deletedAt, originalId, ...saleData } = itemData;
        
        // Restore to sales collection
        await addDoc(collection(db, 'sales'), {
            ...saleData,
            userId: auth.currentUser.uid
        });
        
        // Remove from trash
        await deleteDoc(doc(db, 'trash', trashId));
        
        loadTrashItems();
        loadSales();
        updateTrashCount();
        
        alert('Venta restaurada exitosamente');
    } catch (error) {
        alert('Error al restaurar: ' + error.message);
    }
};

window.deleteFromTrash = async (trashId) => {
    if (confirm('¿Eliminar permanentemente esta venta?')) {
        try {
            await deleteDoc(doc(db, 'trash', trashId));
            loadTrashItems();
            updateTrashCount();
        } catch (error) {
            alert('Error al eliminar: ' + error.message);
        }
    }
};

window.emptyTrash = async () => {
    if (confirm('¿Estás seguro de vaciar la papelera? Esta acción no se puede deshacer.')) {
        try {
            const trashQuery = query(
                collection(db, 'trash'),
                where('userId', '==', auth.currentUser.uid)
            );
            
            const snapshot = await getDocs(trashQuery);
            const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
            await Promise.all(deletePromises);
            
            loadTrashItems();
            updateTrashCount();
            alert('Papelera vaciada exitosamente');
        } catch (error) {
            alert('Error al vaciar la papelera: ' + error.message);
        }
    }
};

// Update modal initialization
document.getElementById('trashModal').addEventListener('show.bs.modal', () => {
    loadTrashItems();
});

// Agregar event listener para ordenamiento
window.applySorting = function() {
    applyFiltersAndSort();
};

// Modificar el observer de autenticación
auth.onAuthStateChanged(async (user) => {
    try {
        // Limpiar datos anteriores
        currentSales = [];
        currentFilter = null;
        
        // Resetear estadísticas
        updateDashboardStats({
            active: 0,
            nearExpiry: 0,
            expiringToday: 0,
            expired: 0,
            totalAmount: 0
        });
        
        // Actualizar visibilidad de contenedores
        document.getElementById('authContainer').style.display = user ? 'none' : 'block';
        document.getElementById('dashboardContainer').style.display = user ? 'block' : 'none';
        
        if (user) {
            // Cargar datos del usuario actual
            await Promise.all([
                loadSales(),
                loadFilters(),
                updateTrashCount()
            ]);
        } else {
            // Limpiar interfaz cuando no hay usuario
            document.getElementById('salesList').innerHTML = '';
            document.getElementById('filtersList').innerHTML = '';
            document.getElementById('trashCount').textContent = '0';
        }
    } catch (error) {
        console.error('Error durante la inicialización:', error);
        showError('Error al cargar la aplicación');
    } finally {
        // Ocultar pantalla de carga con animación
        const splashScreen = document.getElementById('splashScreen');
        splashScreen.classList.add('fade-out');
        setTimeout(() => {
            splashScreen.style.display = 'none';
        }, 300);
    }
});

// Exponer explícitamente las funciones necesarias al objeto window
window.deleteSale = async (saleId) => {
    if (confirm('¿Mover esta venta a la papelera?')) {
        try {
            const saleDoc = await getDoc(doc(db, 'sales', saleId));
            const saleData = saleDoc.data();
            
            // Verificar que la venta pertenezca al usuario actual
            if (saleData.userId !== auth.currentUser.uid) {
                throw new Error('No tienes permiso para eliminar esta venta');
            }
            
            await addDoc(collection(db, 'trash'), {
                ...saleData,
                originalId: saleId,
                deletedAt: getChileDateTime(),
                userId: auth.currentUser.uid
            });
            
            await deleteDoc(doc(db, 'sales', saleId));
            
            loadSales();
            updateTrashCount();
            showSuccess('Venta movida a la papelera');
        } catch (error) {
            showError('Error al mover a papelera: ' + error.message);
        }
    }
};

// Crear función toggleStatus
window.toggleStatus = async (saleId, currentStatus) => {
    try {
        const saleRef = doc(db, 'sales', saleId);
        const saleDoc = await getDoc(saleRef);
        const saleData = saleDoc.data();

        // Verificar que la venta pertenezca al usuario actual
        if (saleData.userId !== auth.currentUser.uid) {
            throw new Error('No tienes permiso para modificar esta venta');
        }

        await updateDoc(saleRef, {
            status: currentStatus === 'completed' ? 'active' : 'completed',
            updatedAt: getChileDateTime()
        });
        
        loadSales();
        showSuccess(`Venta ${currentStatus === 'completed' ? 'reactivada' : 'completada'} exitosamente`);
    } catch (error) {
        showError('Error al cambiar estado: ' + error.message);
    }
};

// Asegurarse de que todas las funciones que se llaman desde el HTML estén expuestas
Object.assign(window, {
    editSale,
    renewSale,
    togglePasswordDisplay,
    copyToClipboard,
    clearFilters,
    applyFilter,
    deleteFilter,
    applySorting,
    emptyTrash,
    restoreFromTrash,
    deleteFromTrash,
    togglePassword,
    toggleStatus, // Agregar toggleStatus a la lista
    deleteSale
});

// Agregar después de la inicialización de la aplicación
const shareButton = document.getElementById('shareButton');
const shareModal = new bootstrap.Modal(document.getElementById('shareModal'));

// Configuración para compartir
const shareData = {
    title: 'SellStream - Sistema de Gestión de Suscripciones',
    text: '¡Descubre SellStream! La manera más fácil de gestionar y dar seguimiento a tus suscripciones.',
    url: 'https://sellstream.trustzonestore.com'
};

// Handler para el botón de compartir
shareButton.addEventListener('click', async () => {
    // Si el navegador soporta Web Share API y está en un contexto seguro
    if (navigator.share && window.isSecureContext) {
        try {
            await navigator.share(shareData);
            showSuccess('¡Gracias por compartir!');
        } catch (err) {
            // Si el usuario cancela la acción, no mostrar error
            if (err.name !== 'AbortError') {
                shareModal.show();
            }
        }
    } else {
        // Fallback al modal de compartir
        shareModal.show();
    }
});

// Manejadores para los botones de redes sociales
document.getElementById('shareWhatsApp').addEventListener('click', () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareData.text + ' ' + shareData.url)}`);
});

document.getElementById('shareFacebook').addEventListener('click', () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareData.url)}`);
});

document.getElementById('shareTwitter').addEventListener('click', () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareData.text)}&url=${encodeURIComponent(shareData.url)}`);
});

document.getElementById('shareLinkedIn').addEventListener('click', () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareData.url)}`);
});

// Manejar la copia del enlace
document.getElementById('copyLinkBtn').addEventListener('click', async () => {
    const shareLink = document.getElementById('shareLink');
    
    try {
        await navigator.clipboard.writeText(shareLink.value);
        showSuccess('¡Enlace copiado!');
        
        // Efecto visual en el botón
        const btn = document.getElementById('copyLinkBtn');
        btn.innerHTML = '<i class="fas fa-check me-2"></i>Copiado';
        btn.classList.replace('btn-outline-primary', 'btn-success');
        
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-copy me-2"></i>Copiar';
            btn.classList.replace('btn-success', 'btn-outline-primary');
        }, 2000);
    } catch (err) {
        showError('Error al copiar el enlace');
    }
});

// Reemplazar el handler del botón de tutoriales
tutorialsButton.addEventListener('click', () => {
    window.location.href = 'tutorials.html';
});

// Agregar handler del botón del foro
document.getElementById('forumButton').addEventListener('click', () => {
    window.location.href = 'forum.html';
});

// Eliminar el código del modal de tutoriales que ya no se usará
