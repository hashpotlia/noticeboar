// Simple Cognito Authentication (No Amplify needed)
class SimpleCognitoAuth {
    constructor() {
        this.clientId = '1n7mfqu9hgg7qplf3j95mbcnus';
        this.currentUser = null;
        this.accessToken = null;
    }

    async signIn(email, password) {
        try {
            console.log('🔐 Attempting sign in...');
            
            const response = await fetch('https://cognito-idp.us-east-1.amazonaws.com/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-amz-json-1.1',
                    'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
                },
                body: JSON.stringify({
                    ClientId: this.clientId,
                    AuthFlow: 'USER_PASSWORD_AUTH',
                    AuthParameters: {
                        USERNAME: email,
                        PASSWORD: password
                    }
                })
            });
            
            const result = await response.json();
            console.log('📋 Sign in response:', result);
            
            if (result.AuthenticationResult) {
                // Success - store user info
                this.accessToken = result.AuthenticationResult.AccessToken;
                this.currentUser = {
                    email: email,
                    accessToken: this.accessToken,
                    idToken: result.AuthenticationResult.IdToken,
                    refreshToken: result.AuthenticationResult.RefreshToken
                };
                
                // Store in localStorage for persistence
                localStorage.setItem('akl_auth_user', JSON.stringify(this.currentUser));

                
                console.log('✅ Sign in successful');
                return { success: true, user: this.currentUser };
            }
            
            if (result.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
                // Handle password challenge
                return { 
                    success: false, 
                    challenge: 'NEW_PASSWORD_REQUIRED',
                    session: result.Session,
                    message: 'New password required'
                };
            }
            
            return { 
                success: false, 
                message: result.message || 'Authentication failed' 
            };
            
        } catch (error) {
            console.error('❌ Sign in error:', error);
            return { 
                success: false, 
                message: `Network error: ${error.message}` 
            };
        }
    }

    async setNewPassword(email, newPassword, session) {
        try {
            console.log('🔄 Setting new password...');
            
            const response = await fetch('https://cognito-idp.us-east-1.amazonaws.com/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-amz-json-1.1',
                    'X-Amz-Target': 'AWSCognitoIdentityProviderService.RespondToAuthChallenge'
                },
                body: JSON.stringify({
                    ClientId: this.clientId,
                    ChallengeName: 'NEW_PASSWORD_REQUIRED',
                    Session: session,
                    ChallengeResponses: {
                        USERNAME: email,
                        NEW_PASSWORD: newPassword
                    }
                })
            });
            
            const result = await response.json();
            console.log('📋 Password challenge response:', result);
            
            if (result.AuthenticationResult) {
                // Success - store user info
                this.accessToken = result.AuthenticationResult.AccessToken;
                this.currentUser = {
                    email: email,
                    accessToken: this.accessToken,
                    idToken: result.AuthenticationResult.IdToken,
                    refreshToken: result.AuthenticationResult.RefreshToken
                };
                
                // Store in localStorage
                //localStorage.setItem('akl_auth_user', JSON.stringify(this.currentUser));
				// FIXED VERSION
const userDataToStore = {
    ...this.currentUser,
    // Ensure dbUser is included in storage
    dbUser: userRecord,
    role: userRecord.role,
    department: userRecord.department,
    name: userRecord.name
};
localStorage.setItem('akl_auth_user', JSON.stringify(userDataToStore));
                
                console.log('✅ Password set and authentication completed');
                return { success: true, user: this.currentUser };
            }
            
            return { 
                success: false, 
                message: result.message || 'Failed to set password' 
            };
            
        } catch (error) {
            console.error('❌ Set password error:', error);
            return { 
                success: false, 
                message: `Network error: ${error.message}` 
            };
        }
    }

async getCurrentUser() {
    // Check localStorage first
    const storedUser = localStorage.getItem('akl_auth_user');
    if (storedUser) {
        try {
            const parsedUser = JSON.parse(storedUser);
            this.currentUser = parsedUser;
            this.accessToken = parsedUser.accessToken;
            
            // CRITICAL FIX: If dbUser is missing, fetch it from database
            if (!parsedUser.dbUser && parsedUser.email) {
                console.log('🔄 dbUser missing, fetching from database...');
                try {
                    const userRecord = await getUserByEmail(parsedUser.email);
                    if (userRecord) {
                        this.currentUser.dbUser = userRecord;
                        this.currentUser.role = userRecord.role;
                        this.currentUser.department = userRecord.department;
                        this.currentUser.name = userRecord.name;
                        
                        // Update localStorage with complete data
                        localStorage.setItem('akl_auth_user', JSON.stringify(this.currentUser));
                        console.log('✅ User data restored and updated');
                    }
                } catch (error) {
                    console.error('❌ Failed to fetch user record:', error);
                }
            }
            
            console.log('✅ User restored from storage');
            return this.currentUser;
        } catch (error) {
            console.log('❌ Invalid stored user data');
            localStorage.removeItem('akl_auth_user');
        }
    }
    
    return null;
}


    signOut() {
        this.currentUser = null;
        this.accessToken = null;
        localStorage.removeItem('akl_auth_user');
        console.log('✅ Signed out');
    }

    isAuthenticated() {
        return this.currentUser !== null && this.accessToken !== null;
    }
	
	// Add these methods to your SimpleCognitoAuth class

async signUp(email, password) {
    try {
        console.log('✨ Attempting sign up...');
        
        const response = await fetch('https://cognito-idp.us-east-1.amazonaws.com/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp'
            },
            body: JSON.stringify({
                ClientId: this.clientId,
                Username: email,
                Password: password,
                UserAttributes: [
                    {
                        Name: 'email',
                        Value: email
                    }
                ]
            })
        });
        
        const result = await response.json();
        console.log('📋 Sign up response:', result);
        
        if (result.UserSub) {
            console.log('✅ Sign up successful - confirmation needed');
            return { 
                success: true, 
                needsConfirmation: true,
                message: 'Account created! Please check your email for confirmation code.' 
            };
        }
        
        return { 
            success: false, 
            message: result.message || 'Sign up failed' 
        };
        
    } catch (error) {
        console.error('❌ Sign up error:', error);
        return { 
            success: false, 
            message: `Network error: ${error.message}` 
        };
    }
}

async resetPassword(email) {
    try {
        console.log('🔑 Attempting password reset...');
        
        const response = await fetch('https://cognito-idp.us-east-1.amazonaws.com/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.ForgotPassword'
            },
            body: JSON.stringify({
                ClientId: this.clientId,
                Username: email
            })
        });
        
        const result = await response.json();
        console.log('📋 Password reset response:', result);
        
        if (result.CodeDeliveryDetails) {
            console.log('✅ Password reset code sent');
            return { 
                success: true, 
                message: 'Password reset code sent to your email!' 
            };
        }
        
        return { 
            success: false, 
            message: result.message || 'Password reset failed' 
        };
        
    } catch (error) {
        console.error('❌ Password reset error:', error);
        return { 
            success: false, 
            message: `Network error: ${error.message}` 
        };
    }
}

// Add this method to your SimpleCognitoAuth class
async confirmPasswordReset(email, confirmationCode, newPassword) {
    try {
        console.log('🔐 Confirming password reset...');
        
        const response = await fetch('https://cognito-idp.us-east-1.amazonaws.com/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.ConfirmForgotPassword'
            },
            body: JSON.stringify({
                ClientId: this.clientId,
                Username: email,
                ConfirmationCode: confirmationCode,
                Password: newPassword
            })
        });
        
        const result = await response.json();
        console.log('📋 Password reset confirmation response:', result);
        
        if (response.ok && !result.message) {
            console.log('✅ Password reset completed successfully');
            return { 
                success: true, 
                message: 'Password reset successfully! You can now sign in with your new password.' 
            };
        }
        
        return { 
            success: false, 
            message: result.message || 'Password reset confirmation failed' 
        };
        
    } catch (error) {
        console.error('❌ Password reset confirmation error:', error);
        return { 
            success: false, 
            message: `Network error: ${error.message}` 
        };
    }
}

// Add this method to your SimpleCognitoAuth class
async confirmSignUp(email, confirmationCode) {
    try {
        console.log('✅ Confirming sign up...');
        
        const response = await fetch('https://cognito-idp.us-east-1.amazonaws.com/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.ConfirmSignUp'
            },
            body: JSON.stringify({
                ClientId: this.clientId,
                Username: email,
                ConfirmationCode: confirmationCode
            })
        });
        
        const result = await response.json();
        console.log('📋 Sign up confirmation response:', result);
        
        if (response.ok && !result.message) {
            console.log('✅ Account confirmed successfully');
            return { 
                success: true, 
                message: 'Account verified successfully! You can now sign in.' 
            };
        }
        
        return { 
            success: false, 
            message: result.message || 'Account verification failed' 
        };
        
    } catch (error) {
        console.error('❌ Sign up confirmation error:', error);
        return { 
            success: false, 
            message: `Network error: ${error.message}` 
        };
    }
}

// Add resend confirmation code method
async resendConfirmationCode(email) {
    try {
        console.log('📧 Resending confirmation code...');
        
        const response = await fetch('https://cognito-idp.us-east-1.amazonaws.com/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.ResendConfirmationCode'
            },
            body: JSON.stringify({
                ClientId: this.clientId,
                Username: email
            })
        });
        
        const result = await response.json();
        console.log('📋 Resend confirmation response:', result);
        
        if (result.CodeDeliveryDetails) {
            console.log('✅ Confirmation code resent');
            return { 
                success: true, 
                message: 'Verification code sent to your email!' 
            };
        }
        
        return { 
            success: false, 
            message: result.message || 'Failed to resend code' 
        };
        
    } catch (error) {
        console.error('❌ Resend confirmation error:', error);
        return { 
            success: false, 
            message: `Network error: ${error.message}` 
        };
    }
}

// Add this method to your SimpleCognitoAuth class
async createOrUpdateUserRecord(email, cognitoId, additionalData = {}) {
    try {
        // Check if user already exists
        let user = await getUserByEmail(email);
        
        if (!user) {
            // Create new user record
            const userData = {
                email: email,
                cognitoId: cognitoId,
                name: additionalData.name || email.split('@')[0], // Default name from email
                department: additionalData.department || 'General',
                role: additionalData.role || 'USER', // Default role
                isActive: true,
                lastLoginAt: new Date().toISOString()
            };
            
            user = await createUserInDB(userData);
            console.log('✅ New user record created:', user);
        } else {
            // Update last login
            user = await updateUserInDB(user.id, {
                lastLoginAt: new Date().toISOString()
            });
            console.log('✅ User login updated:', user);
        }
        
        return user;
    } catch (error) {
        console.error('❌ Failed to create/update user record:', error);
        return null;
    }
}

	
}

// Initialize the auth system
const cognitoAuth = new SimpleCognitoAuth();
